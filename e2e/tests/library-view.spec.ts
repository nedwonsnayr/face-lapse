import { test, expect } from "@playwright/test";
import { alignStagedImages, deleteAllImages, uploadAndStage, WITH_FACE } from "../utils/helpers";

test.describe("Face Lapse – library list/grid view", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.removeItem("face-lapse:library-view"));
    await deleteAllImages(page);
    await page.reload();
    await uploadAndStage(page, WITH_FACE);
    await alignStagedImages(page);
    await page.reload(); // drop "Just uploaded" so each photo shows once
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("switches to list view, stays usable, and remembers the choice", async ({ page }) => {
    const items = page.getByTestId("previously-processed-group").getByTestId("library-items");
    await expect(items).toHaveAttribute("data-view", "grid");
    await expect(page.getByTestId("library-view-grid")).toHaveAttribute("aria-pressed", "true");

    await page.getByTestId("library-view-list").click();
    await expect(items).toHaveAttribute("data-view", "list");
    await expect(page.getByTestId("library-view-list")).toHaveAttribute("aria-pressed", "true");

    // Rows show the phone's original filename, and controls work without hover.
    const [first] = await (await page.request.get("/api/images")).json();
    const row = page.getByTestId(`previous-image-card-${first.id}`);
    await expect(row).toContainText("face_1.jpg");
    await expect(page.getByTestId(`delete-button-${first.id}`)).toBeVisible();
    await page.getByTestId(`toggle-include-button-${first.id}`).click();
    await expect(page.getByTestId(`toggle-include-button-${first.id}`)).toHaveText("Out");

    // Remembered on this device after a reload.
    await page.reload();
    await expect(items).toHaveAttribute("data-view", "list");

    await page.getByTestId("library-view-grid").click();
    await expect(items).toHaveAttribute("data-view", "grid");
  });

  for (const [name, size] of [
    ["phone", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ] as const) {
    test(`list view screenshot (${name})`, async ({ page }) => {
      await page.setViewportSize(size);
      await page.getByTestId("library-view-list").click();
      const group = page.getByTestId("previously-processed-group");
      await group.scrollIntoViewIfNeeded();
      await group.screenshot({ path: `test-results/list-view-${name}.png` });
    });
  }
});
