import { test, expect, Page } from "@playwright/test";
import { alignStagedImages, deleteAllImages, uploadAndStage, WITH_FACE } from "../utils/helpers";

const LIGHT_PAPER = "rgb(246, 243, 238)";
const DARK_PAPER = "rgb(22, 20, 17)";

const bodyBackground = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

async function openSettings(page: Page) {
  await page.getByTestId("settings-button").click();
  await expect(page.getByTestId("settings-dialog")).toBeVisible();
}

test.describe("Face Lapse – settings and themes", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.removeItem("face-lapse:settings");
      localStorage.removeItem("face-lapse:library-view");
    });
  });

  test("theme follows the device by default and can be forced either way", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    expect(await bodyBackground(page)).toBe(LIGHT_PAPER);

    // System mode follows a live device change, with no reload.
    await page.emulateMedia({ colorScheme: "dark" });
    await expect.poll(() => bodyBackground(page)).toBe(DARK_PAPER);
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#161411");

    await openSettings(page);
    await expect(page.getByTestId("theme-system")).toBeChecked();
    await page.getByTestId("theme-light").check();
    await expect.poll(() => bodyBackground(page)).toBe(LIGHT_PAPER);

    await page.emulateMedia({ colorScheme: "light" });
    await page.getByTestId("theme-dark").check();
    await expect.poll(() => bodyBackground(page)).toBe(DARK_PAPER);
    await page.keyboard.press("Escape");
    await expect(page.getByTestId("settings-dialog")).toBeHidden();

    // Survives a reload, and is applied before React mounts (no light flash).
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    expect(await bodyBackground(page)).toBe(DARK_PAPER);
  });

  test("the pre-paint script applies the saved theme before the app loads", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await page.evaluate(() => localStorage.setItem("face-lapse:settings", JSON.stringify({ theme: "dark" })));
    // Block the app bundle: only index.html and its inline script run.
    await page.route("**/src/main.tsx*", route => route.abort());
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator('meta[name="theme-color"]')).toHaveAttribute("content", "#161411");
  });

  test("corrupt or unknown saved values fall back to defaults", async ({ page }) => {
    await page.evaluate(() => localStorage.setItem("face-lapse:settings",
      JSON.stringify({ theme: "neon", frameDuration: 99, autoplay: "yes", libraryView: "list" })));
    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "system");
    await openSettings(page);
    await expect(page.getByTestId("theme-system")).toBeChecked();
    await expect(page.getByTestId("setting-speed-value")).toHaveText("0.05s");
    await expect(page.getByTestId("setting-autoplay")).toBeChecked();
    await expect(page.getByTestId("setting-view-list")).toBeChecked(); // the one valid field is kept
  });

  test.describe("with photos", () => {
    test.beforeEach(async ({ page }) => {
      await deleteAllImages(page);
      await page.reload();
      await uploadAndStage(page, WITH_FACE);
      await alignStagedImages(page);
      await page.reload();
    });

    test.afterEach(async ({ page }) => {
      await deleteAllImages(page);
    });

    test("playback and library defaults apply on open; inline changes stay for one visit", async ({ page }) => {
      await expect(page.getByTestId("play-pause-button")).toHaveAttribute("aria-label", "Pause");
      await expect(page.getByTestId("timelapse-date-overlay")).toBeVisible();

      await openSettings(page);
      await page.getByTestId("setting-speed-input").fill("0.5");
      await page.getByTestId("setting-autoplay").uncheck();
      await page.getByTestId("setting-show-date").uncheck();
      await page.getByTestId("setting-view-list").check();
      await page.getByTestId("setting-order-newest").check();
      await page.getByTestId("settings-close").click();

      await page.reload();
      const items = page.getByTestId("previously-processed-group").getByTestId("library-items");
      await expect(items).toHaveAttribute("data-view", "list");
      await expect(page.getByTestId("library-sort-button")).toHaveText("Newest first");
      await expect(page.getByTestId("play-pause-button")).toHaveAttribute("aria-label", "Play");
      await expect(page.getByTestId("frame-counter")).toHaveText("1 / 3");
      await expect(page.getByTestId("speed-slider-value")).toHaveText("0.50s");
      await expect(page.getByTestId("show-dates-toggle")).not.toBeChecked();
      await expect(page.getByTestId("timelapse-date-overlay")).toHaveCount(0);

      // Changing the inline controls doesn't rewrite the saved defaults...
      await page.getByTestId("library-sort-button").click();
      await page.getByTestId("show-dates-toggle").check();
      await page.getByTestId("speed-slider-input").fill("0.1");
      await page.reload();
      await expect(page.getByTestId("library-sort-button")).toHaveText("Newest first");
      await expect(page.getByTestId("show-dates-toggle")).not.toBeChecked();
      await expect(page.getByTestId("speed-slider-value")).toHaveText("0.50s");

      // ...except grid/list, which was already remembered per device.
      await page.getByTestId("library-view-grid").click();
      await page.reload();
      await expect(items).toHaveAttribute("data-view", "grid");
      await openSettings(page);
      await expect(page.getByTestId("setting-view-grid")).toBeChecked();
    });

    test("an existing grid/list choice carries over as the default view", async ({ page }) => {
      await page.evaluate(() => localStorage.setItem("face-lapse:library-view", "list"));
      await page.reload();
      const items = page.getByTestId("previously-processed-group").getByTestId("library-items");
      await expect(items).toHaveAttribute("data-view", "list");
    });
  });
});
