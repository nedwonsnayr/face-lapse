import { test, expect } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  uploadAndStage,
  WITH_FACE,
} from "../utils/helpers";

test.describe("Face Lapse – face detected (real images)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("aligning real face images succeeds and populates timelapse", async ({
    page,
  }) => {
    await uploadAndStage(page, WITH_FACE);
    await alignStagedImages(page);

    await expect(page.getByTestId("alignment-result-success")).toBeVisible();

    await expect(
      page
        .getByTestId("just-uploaded-group")
        .or(page.getByTestId("previously-processed-group"))
    ).toBeVisible({ timeout: 10_000 });

    await expect(page.getByTestId("play-pause-button")).toBeVisible();
    await expect(page.getByTestId("frame-counter")).toBeVisible();
    await expect(page.getByTestId("download-video-button")).toBeVisible();
  });

  test("toggle image exclusion removes it from timelapse count", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    const frameCounter = page.getByTestId("frame-counter");
    await expect(frameCounter).toBeVisible({ timeout: 10_000 });
    const initialText = await frameCounter.textContent();
    const initialTotal = parseInt(initialText!.split("/")[1].trim(), 10);

    const imagesRes = await page.request.get("/api/images");
    const images = await imagesRes.json();
    const firstImageId = images.find((img: any) => img.has_aligned)?.id;
    expect(firstImageId).toBeDefined();

    const toggleButton = page.getByTestId(`toggle-include-button-${firstImageId}`);
    await toggleButton.click();

    await expect(toggleButton).toHaveText("Out", { timeout: 10_000 });

    const updatedFrameCounter = page.getByTestId("frame-counter");
    await expect(updatedFrameCounter).toBeVisible({ timeout: 10_000 });
    await expect(updatedFrameCounter).toContainText(`${initialTotal - 1}`, {
      timeout: 10_000,
    });
  });

  test("download video generates and downloads MP4 file", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    const downloadButton = page.getByTestId("download-video-button");
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });

    const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
    await downloadButton.click();
    const download = await downloadPromise;

    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^face-lapse-\d{2}-\d{2}-\d{4}\.mp4$/);
  });
});
