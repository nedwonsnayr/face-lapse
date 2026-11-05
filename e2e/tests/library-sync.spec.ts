import { test, expect, type Page } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  uploadAndStage,
  uploadFileViaAPI,
  WITH_FACE,
} from "../utils/helpers";

/** Simulate another device: upload (and optionally align) over the API only. */
async function addFromOtherDevice(page: Page, file: string, align: boolean): Promise<number> {
  const [uploaded] = await uploadFileViaAPI(page, file);
  if (align) {
    const res = await page.request.post("/api/images/align", { data: { image_ids: [uploaded.id] } });
    expect(res.ok()).toBeTruthy();
    await res.body(); // align streams NDJSON; wait for it to finish
  }
  return uploaded.id;
}

async function listImages(page: Page): Promise<any[]> {
  return (await page.request.get("/api/images")).json();
}

test.describe("Face Lapse – library stays in sync", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("a new upload shows in Just uploaded AND the main list", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await page.reload(); // first photo is now an existing library photo

    await uploadAndStage(page, [WITH_FACE[1]]);
    await alignStagedImages(page);

    const [, newest] = await listImages(page);
    await expect(page.getByTestId(`recent-image-card-${newest.id}`)).toBeVisible();
    await expect(page.getByTestId(`previous-image-card-${newest.id}`)).toBeVisible();
    await expect(page.getByTestId("previously-processed-group")).toContainText("All photos");
  });

  test("photos added on another device appear when the tab regains focus", async ({ page }) => {
    await expect(page.getByTestId("empty-library-message")).toBeVisible();

    const id = await addFromOtherDevice(page, WITH_FACE[0], true);

    // No reload: returning to the tab triggers a re-check.
    await page.evaluate(() => window.dispatchEvent(new Event("focus")));
    await expect(page.getByTestId(`previous-image-card-${id}`)).toBeVisible({ timeout: 10_000 });
  });

  test("uploads staged on another device stay out of the library and survive Dismiss All", async ({ page }) => {
    const stagedId = await addFromOtherDevice(page, WITH_FACE[0], false);

    await page.reload();
    await expect(page.getByTestId("empty-library-message")).toBeVisible();
    await expect(page.getByTestId("no-face-group")).toHaveCount(0);

    const res = await page.request.delete("/api/images/no-face");
    expect((await res.json()).deleted).toBe(0);
    const ids = (await listImages(page)).map((i) => i.id);
    expect(ids).toContain(stagedId);
  });

  test("a reused image ID gets a new image URL", async ({ page }) => {
    const first = await addFromOtherDevice(page, WITH_FACE[0], false);
    const before = (await listImages(page)).find((i) => i.id === first);
    await page.request.delete(`/api/images/${first}`);

    const second = await addFromOtherDevice(page, WITH_FACE[1], false);
    const after = (await listImages(page)).find((i) => i.id === second);

    // SQLite reuses the highest rowid after a delete, so the IDs can match;
    // the cache key must differ regardless.
    expect(after.content_hash).not.toBe(before.content_hash);
  });

  test("image list answers 304 to a weak ETag (as Cloudflare sends it)", async ({ page }) => {
    const res = await page.request.get("/api/images");
    const etag = res.headers()["etag"];
    expect(etag).toBeTruthy();
    const again = await page.request.get("/api/images", { headers: { "If-None-Match": `W/${etag}` } });
    expect(again.status()).toBe(304);
  });
});
