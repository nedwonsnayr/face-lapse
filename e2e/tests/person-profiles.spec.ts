import { test, expect } from "@playwright/test";
import { deleteAllImages, uploadAndStage, alignStagedImages, WITH_FACE } from "../utils/helpers";

test.describe("Person workspaces", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
    await expect(page.getByRole("tab", { name: "Ryan", exact: true })).toHaveAttribute("aria-selected", "true");
  });
  test.afterEach(async ({ page }) => {
    // All disposable profiles are owned by this test server, never the real library.
    const people = await (await page.request.get("/api/profiles")).json();
    for (const p of people) {
      for (const img of await (await page.request.get(`/api/images?profile_id=${p.id}`)).json()) {
        await page.request.delete(`/api/images/${img.id}?profile_id=${p.id}`);
      }
    }
  });

  test("a new person's library, birthday and export stay separate, and the selected tab survives reload", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    const ryanId = (await (await page.request.get("/api/images")).json())[0].id;

    await page.getByRole("button", { name: "Add person", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Name", { exact: true }).fill("Sam");
    await dialog.getByLabel(/Birthday/).fill("2000-03-04");
    const created = page.waitForResponse(r => new URL(r.url()).pathname === "/api/profiles" && r.request().method() === "POST");
    await dialog.getByRole("button", { name: "Create person" }).click();
    const sam = await (await created).json();
    await expect(page.locator(`#person-tab-${sam.id}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("empty-library-message")).toBeVisible();
    await expect(page.getByRole("button", { name: "Add photos for Sam" })).toBeVisible();

    // The same source is allowed in a second person's library.
    await uploadAndStage(page, [WITH_FACE[0]]);
    await expect(page.getByTestId("staging-item-new")).toHaveCount(1);
    await alignStagedImages(page);
    await expect(page.getByTestId("birthday-input")).toHaveValue("Mar 4, 2000");
    const samImages = await (await page.request.get(`/api/images?profile_id=${sam.id}`)).json();
    expect(samImages).toHaveLength(1);
    expect(samImages[0].id).not.toBe(ryanId);
    await expect(page.getByTestId("timelapse-frame")).toHaveAttribute("src", new RegExp(`profile_id=${sam.id}`));

    const generateRequest = page.waitForRequest(req => req.url().includes("/api/video/generate?"));
    const downloadEvent = page.waitForEvent("download");
    await page.getByTestId("download-video-button").click();
    const req = new URL((await generateRequest).url());
    expect(req.searchParams.get("profile_id")).toBe(String(sam.id));
    expect(req.searchParams.get("birthday")).toBe("2000-03-04");
    const download = await downloadEvent;
    expect(download.url()).toContain(`profile_id=${sam.id}`);
    expect(download.url()).toContain(`person-${sam.id}-`);

    await page.reload();
    await expect(page.locator(`#person-tab-${sam.id}`)).toHaveAttribute("aria-selected", "true");
    await page.getByRole("button", { name: "Edit Sam", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Name", { exact: true }).fill("Samantha");
    await page.getByRole("dialog").getByRole("button", { name: "Save changes" }).click();
    await expect(page.locator(`#person-tab-${sam.id}`)).toHaveAttribute("aria-selected", "true");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: "test-results/person-tabs-phone.png", fullPage: true });

    await page.getByRole("tab", { name: "Ryan", exact: true }).click();
    await expect(page.getByTestId("birthday-input")).toHaveValue("Oct 6, 1995");
    await expect(page.getByTestId("timelapse-frame")).toHaveAttribute("src", new RegExp(`/images/${ryanId}/`));
  });

  test("staged photos return to their original person's tray", async ({ page }) => {
    const p = (await (await page.request.post("/api/profiles", { data: { name: "Taylor" } })).json());
    await page.reload();
    await page.getByRole("tab", { name: "Ryan", exact: true }).focus();
    await page.getByRole("tab", { name: "Ryan", exact: true }).press("End");
    await expect(page.locator(`#person-tab-${p.id}`)).toHaveAttribute("aria-selected", "true");
    await expect(page.locator(`#person-tab-${p.id}`)).toBeFocused();
    await uploadAndStage(page, [WITH_FACE[1]]);
    await page.getByRole("tab", { name: "Ryan", exact: true }).click();
    await expect(page.getByTestId("staging-grid")).not.toBeVisible();
    await page.locator(`#person-tab-${p.id}`).click();
    await expect(page.getByTestId("staging-item-new")).toHaveCount(1);
    await alignStagedImages(page);
    await expect(page.getByTestId("timelapse-frame")).toHaveAttribute("src", new RegExp(`profile_id=${p.id}`));
    // No birthday: no age caption or arbitrary default birthday from Ryan.
    await expect(page.getByTestId("show-age-toggle")).not.toBeChecked();
    await page.getByTestId("show-age-toggle").check();
    await expect(page.getByTestId("download-video-button")).toBeDisabled();
  });

  test("a slow previous-person response cannot replace the selected library", async ({ page }) => {
    const other = (await (await page.request.post("/api/profiles", { data: { name: "Jordan" } })).json());
    await page.reload();
    await expect(page.getByTestId("empty-library-message")).toBeVisible();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    let requested!: () => void;
    const seen = new Promise<void>(resolve => { requested = resolve; });
    await page.route(/\/api\/images\?profile_id=1$/, async route => {
      requested();
      await gate;
      await route.fulfill({ json: [{ id: 99999, profile_id: 1, original_filename: "stale.jpg", pending: false, face_detected: true, has_aligned: true, included_in_video: true }] });
    });
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await seen;
    await page.locator(`#person-tab-${other.id}`).click();
    await expect(page.getByTestId("empty-library-message")).toBeVisible();
    release();
    await expect(page.getByRole("tabpanel")).not.toContainText("stale.jpg");
    await expect(page.locator(`#person-tab-${other.id}`)).toHaveAttribute("aria-selected", "true");
    expect(await (await page.request.get(`/api/images?profile_id=${other.id}`)).json()).toEqual([]);
  });
  test("camera permission arriving after a tab switch immediately stops its stream", async ({ page }) => {
    const p = await (await page.request.post("/api/profiles", { data: { name: "Camera test" } })).json();
    await page.reload();
    await expect(page.getByTestId("webcam-button")).toBeVisible();
    await page.evaluate(() => {
      const canvas = document.createElement("canvas");
      const stream = canvas.captureStream(1);
      (window as any).__cameraStops = 0;
      stream.getTracks().forEach(track => {
        const stop = track.stop.bind(track);
        track.stop = () => { (window as any).__cameraStops++; stop(); };
      });
      navigator.mediaDevices.getUserMedia = () => new Promise(resolve => {
        (window as any).__releaseCamera = () => resolve(stream);
      });
    });
    await page.getByTestId("webcam-button").click();
    await page.locator(`#person-tab-${p.id}`).click();
    await page.evaluate(() => (window as any).__releaseCamera());
    await expect.poll(() => page.evaluate(() => (window as any).__cameraStops)).toBe(1);
    await expect(page.getByTestId("webcam-modal")).not.toBeVisible();
  });

});
