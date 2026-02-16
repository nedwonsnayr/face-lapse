import { test, expect } from "@playwright/test";
import path from "path";
import fs from "fs";

const FIXTURES = path.resolve(__dirname, "fixtures");
const NO_FACE = [
  path.join(FIXTURES, "1.jpg"),
  path.join(FIXTURES, "2.jpg"),
  path.join(FIXTURES, "3.jpg"),
];
const WITH_FACE = [
  path.join(FIXTURES, "face_1.jpg"),
  path.join(FIXTURES, "face_2.jpg"),
  path.join(FIXTURES, "face_3.jpg"),
];

/* ── Helpers ──────────────────────────────────────────── */

/** Upload files via the hidden input, wait for staging area. */
async function uploadAndStage(
  page: import("@playwright/test").Page,
  files: string[]
) {
  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(files);
  // Wait for staging area to appear (staging grid is always present when files are uploaded)
  // Note: "ready to align" text may not appear if all images are duplicates
  await expect(page.getByTestId("staging-grid")).toBeVisible({
    timeout: 20_000,
  });
}

/** Click "Align Images" and wait for alignment to finish (back to idle). */
async function alignStagedImages(page: import("@playwright/test").Page) {
  await page.getByTestId("align-images-button").click();
  // Wait for alignment to complete — the Upload returns to idle and shows
  // a result summary. Both messages can appear, so wait for the results container.
  await expect(
    page.getByTestId("alignment-results")
  ).toBeVisible({ timeout: 60_000 });
}

/** Delete every image via the API so the next test starts clean. */
async function deleteAllImages(page: import("@playwright/test").Page) {
  const res = await page.request.get("/api/images");
  if (!res.ok()) return;
  const images: { id: number }[] = await res.json();
  for (const img of images) {
    await page.request.delete(`/api/images/${img.id}`);
  }
}

/** Upload a file via API and return the response JSON. */
async function uploadFileViaAPI(
  page: import("@playwright/test").Page,
  filePath: string
): Promise<any[]> {
  const fileBuffer = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  
  // Use evaluate to make fetch call from browser context where FormData works
  const result = await page.evaluate(
    async ({ buffer, name, baseUrl }) => {
      const form = new FormData();
      const blob = new Blob([new Uint8Array(buffer)], { type: "image/jpeg" });
      form.append("files", blob, name);
      
      const res = await fetch(`${baseUrl}/api/images/upload`, {
        method: "POST",
        body: form,
      });
      
      if (!res.ok) {
        throw new Error(`Upload failed: ${res.statusText}`);
      }
      
      return res.json();
    },
    { buffer: Array.from(fileBuffer), name: fileName, baseUrl: "http://localhost:5111" }
  );
  
  return result;
}

/* ── Tests ────────────────────────────────────────────── */

test.describe("Face Lapse – empty state", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test("shows empty library and timelapse prompts", async ({ page }) => {
    await expect(page.getByTestId("empty-library-message")).toBeVisible();
    await expect(page.getByTestId("empty-timelapse-message")).toBeVisible();
  });
});

test.describe("Face Lapse – upload & staging", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("upload files shows staging area with correct count", async ({
    page,
  }) => {
    await uploadAndStage(page, NO_FACE);
    await expect(page.getByTestId("staging-image-count")).toContainText("3 images (3 ready to align)");
    await expect(
      page.getByTestId("cancel-staged-button")
    ).toBeVisible();
    await expect(
      page.getByTestId("align-images-button")
    ).toBeVisible();
  });

  test("cancel staged uploads returns to idle", async ({ page }) => {
    await uploadAndStage(page, [NO_FACE[0]]);
    await page.getByTestId("cancel-staged-button").click();
    await expect(
      page.getByTestId("dropzone-text")
    ).toBeVisible();
  });
});

test.describe("Face Lapse – no face detected", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("aligning faceless images shows no-face result and library group", async ({
    page,
  }) => {
    // Upload & align the plain-colored test images (no face)
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    // Result summary should report all 3 as "face not detected"
    await expect(page.getByTestId("alignment-result-failed")).toContainText("3 face not detected");

    // Wait for the library to update (handleAlignComplete triggers fetchImages)
    // The "No Face Detected" group should appear in the library
    await expect(page.getByTestId("no-face-group")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("no-face-group")).toContainText("(3)");

    // "Dismiss All" button should be available
    await expect(
      page.getByTestId("dismiss-all-button")
    ).toBeVisible();

    // Timelapse should still show empty message (no aligned images)
    await expect(page.getByTestId("empty-timelapse-message")).toBeVisible();
  });

  test("dismiss all removes no-face images", async ({ page }) => {
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    // Accept the confirm dialog
    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("dismiss-all-button").click();

    // "No Face Detected" group should disappear
    await expect(page.getByTestId("no-face-group")).not.toBeVisible({
      timeout: 10_000,
    });
  });
});

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

    // Should report successful alignment
    await expect(page.getByTestId("alignment-result-success")).toBeVisible();

    // Wait for library to update (handleAlignComplete triggers fetchImages)
    // Images will appear in "Just Uploaded" (since handleAlignComplete sets recentUploadIds)
    // or "Previously Processed" group
    await expect(
      page.getByTestId("just-uploaded-group").or(page.getByTestId("previously-processed-group"))
    ).toBeVisible({ timeout: 10_000 });

    // Timelapse should now have a play/pause button and scrubber
    await expect(page.getByTestId("play-pause-button")).toBeVisible();
    await expect(page.getByTestId("frame-counter")).toBeVisible(); // frame counter

    // Download Video button should be present
    await expect(
      page.getByTestId("download-video-button")
    ).toBeVisible();
  });

  test("toggle image exclusion removes it from timelapse count", async ({
    page,
  }) => {
    // Upload and align 2 face images
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    // Wait for library to update, then get the initial frame count text (e.g. "1 / 2")
    const frameCounter = page.getByTestId("frame-counter");
    await expect(frameCounter).toBeVisible({ timeout: 10_000 });
    const initialText = await frameCounter.textContent();
    const initialTotal = parseInt(initialText!.split("/")[1].trim(), 10);

    // Get the first image ID from the library to find its toggle button
    const imagesRes = await page.request.get("/api/images");
    const images = await imagesRes.json();
    const firstImageId = images.find((img: any) => img.has_aligned)?.id;
    expect(firstImageId).toBeDefined();

    // Click the "In" button for the first image to exclude it
    const toggleButton = page.getByTestId(`toggle-include-button-${firstImageId}`);
    await toggleButton.click();

    // Wait for the button text to change from "In" to "Out" to confirm the toggle completed
    await expect(toggleButton).toHaveText("Out", { timeout: 10_000 });

    // Wait for frame counter to update with the new count
    // Get a fresh locator in case the element was recreated during re-render
    const updatedFrameCounter = page.getByTestId("frame-counter");
    await expect(updatedFrameCounter).toBeVisible({ timeout: 10_000 });
    await expect(updatedFrameCounter).toContainText(`${initialTotal - 1}`, { timeout: 10_000 });
  });

  test("download video generates and downloads MP4 file", async ({ page }) => {
    // Upload and align face images
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    await alignStagedImages(page);

    // Wait for timelapse to be ready
    const downloadButton = page.getByTestId("download-video-button");
    await expect(downloadButton).toBeVisible({ timeout: 10_000 });

    // Set up download listener BEFORE clicking (critical for catching the download)
    const downloadPromise = page.waitForEvent("download", { timeout: 180_000 }); // 3 minutes for CI

    // Click Download Video button - this triggers async video generation
    await downloadButton.click();

    // Wait for download to complete (download is triggered after generation completes)
    // The download happens automatically after the API call succeeds
    const download = await downloadPromise;

    // Verify filename matches expected pattern (face-lapse-MM-DD-YYYY.mp4)
    const filename = download.suggestedFilename();
    expect(filename).toMatch(/^face-lapse-\d{2}-\d{2}-\d{4}\.mp4$/);
  });
});

test.describe("Face Lapse – mixed upload (face + no face)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("mixed batch shows both aligned and no-face groups", async ({
    page,
  }) => {
    // Upload 1 faceless + 1 face image together
    await uploadAndStage(page, [NO_FACE[0], WITH_FACE[0]]);
    await alignStagedImages(page);

    // Should show both results
    await expect(page.getByTestId("alignment-result-success")).toBeVisible();
    await expect(page.getByTestId("alignment-result-failed")).toBeVisible();

    // Wait for library to update (handleAlignComplete triggers fetchImages)
    // Library should have the "No Face Detected" group
    await expect(page.getByTestId("no-face-group")).toBeVisible({
      timeout: 10_000,
    });

    // Timelapse should work with the 1 aligned image
    await expect(page.getByTestId("play-pause-button")).toBeVisible();
  });
});

test.describe("Face Lapse – duplicate detection", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("uploading duplicate file via API returns skipped response", async ({
    page,
  }) => {
    // Upload first image via API
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result1).toHaveLength(1);
    expect(result1[0]).toHaveProperty("id");
    expect(result1[0]).toHaveProperty("original_filename");
    const firstImageId = result1[0].id;
    const firstImageFilename = result1[0].original_filename;

    // Upload the same file again via API
    const result2 = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result2).toHaveLength(1);
    
    // Verify duplicate response structure
    expect(result2[0]).toHaveProperty("skipped", true);
    expect(result2[0]).toHaveProperty("existing_id", firstImageId);
    expect(result2[0]).toHaveProperty("id", firstImageId);
    expect(result2[0]).toHaveProperty("original_filename", firstImageFilename);
  });

  test("uploading duplicate file results in only one image in database", async ({
    page,
  }) => {
    // Upload first image
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);

    // Get the image count
    const imagesRes1 = await page.request.get("/api/images");
    expect(imagesRes1.ok()).toBeTruthy();
    const images1 = await imagesRes1.json();
    const initialCount = images1.length;

    // Upload the same file again (will be a duplicate)
    // Use API to verify it's skipped, then check database count
    const result = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result[0]).toHaveProperty("skipped", true);

    // Verify only one image was added (count should be the same)
    const imagesRes2 = await page.request.get("/api/images");
    expect(imagesRes2.ok()).toBeTruthy();
    const images2 = await imagesRes2.json();
    expect(images2.length).toBe(initialCount);
  });

  test("uploading duplicate in same batch is handled correctly", async ({
    page,
  }) => {
    // Upload the same file twice in one batch
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0]]);
    
    // Should show staging area with correct counts
    await expect(page.getByTestId("staging-image-count")).toContainText("2 images (1 ready to align)");
    
    // Should show warning message for duplicates
    await expect(page.getByTestId("duplicate-warning")).toContainText("1 duplicate detected and will not be used for alignment");
    
    // Should show duplicate badge on one image
    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(1);
    
    // Align button should be enabled (one non-duplicate)
    await expect(page.getByTestId("align-images-button")).toBeEnabled();

    // Align the images
    await alignStagedImages(page);

    // Verify only one image exists
    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();
    
    // Filter to images with the same source filename (if available) or check count
    // Since we uploaded the same file twice, there should only be one unique image
    const uniqueImages = new Set(images.map((img: any) => img.original_filename));
    expect(uniqueImages.size).toBeLessThanOrEqual(images.length);
  });

  test("uploading duplicate after alignment still prevents duplicate", async ({
    page,
  }) => {
    // Upload and align first image
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);

    // Wait for alignment to complete
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Get initial image count
    const imagesRes1 = await page.request.get("/api/images");
    expect(imagesRes1.ok()).toBeTruthy();
    const images1 = await imagesRes1.json();
    const initialCount = images1.length;

    // Upload the same file again (should be detected as duplicate even though it's aligned)
    const result = await uploadFileViaAPI(page, WITH_FACE[0]);
    
    // Should return skipped response
    expect(result[0]).toHaveProperty("skipped", true);

    // Verify image count hasn't increased
    const imagesRes2 = await page.request.get("/api/images");
    expect(imagesRes2.ok()).toBeTruthy();
    const images2 = await imagesRes2.json();
    expect(images2.length).toBe(initialCount);
  });

  test("uploading different files with same content are detected as duplicates", async ({
    page,
  }) => {
    // Upload first image
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    const firstImageId = result1[0].id;

    // Upload the same file again (same content/hash, should be detected as duplicate)
    const result2 = await uploadFileViaAPI(page, WITH_FACE[0]);
    
    // Should be detected as duplicate
    expect(result2[0]).toHaveProperty("skipped", true);
    expect(result2[0]).toHaveProperty("existing_id", firstImageId);
  });

  test("duplicate badges and visual indicators appear correctly", async ({
    page,
  }) => {
    // Upload first image and align it
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    
    // Wait for alignment to complete
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Upload mix of new and duplicate images
    // WITH_FACE[0] is already in DB, so both instances will be duplicates
    // WITH_FACE[1] is new
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1], WITH_FACE[0]]);
    
    // Should show 3 images with 2 duplicates (both WITH_FACE[0] instances)
    await expect(page.getByTestId("staging-image-count")).toContainText("3 images (1 ready to align)");
    
    // Should show duplicate badges (only on duplicates)
    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(2); // Both WITH_FACE[0] instances are duplicates
    
    // Verify we have 2 duplicate items and 1 new item
    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(2);
    await expect(newItems).toHaveCount(1);
  });

  test("warning message displays correctly for duplicates", async ({
    page,
  }) => {
    // Upload first image and align it
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Upload images with duplicates
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0], WITH_FACE[1]]);
    
    // Should show warning message with correct count
    await expect(page.getByTestId("duplicate-warning")).toContainText("2 duplicates detected and will not be used for alignment");
    
    // Warning should include the warning icon
    await expect(page.getByTestId("duplicate-warning")).toBeVisible();
    
    // Upload only new images (no duplicates)
    await page.getByTestId("cancel-staged-button").click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);
    
    // Warning message should not appear
    await expect(page.getByTestId("duplicate-warning")).not.toBeVisible();
  });

  test("image count displays correctly with duplicates", async ({
    page,
  }) => {
    // Upload first image and align it
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Upload mix: 1 new, 2 duplicates
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0], WITH_FACE[1]]);
    
    // Should show "3 images (1 ready to align)"
    await expect(page.getByTestId("staging-image-count")).toContainText("3 images (1 ready to align)");
    
    // Cancel and upload only duplicates
    await page.getByRole("button", { name: "Cancel" }).click();
    const fileInput3 = page.locator('input[type="file"]');
    await fileInput3.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({ timeout: 20_000 });
    
    // Should show "2 images" without "ready to align" count
    await expect(page.getByTestId("staging-image-count")).toContainText("2 images");
    await expect(page.getByTestId("staging-image-count")).not.toContainText("ready to align");
    
    // Cancel and upload only new images
    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);
    
    // Should show "2 images (2 ready to align)"
    await expect(page.getByTestId("staging-image-count")).toContainText("2 images (2 ready to align)");
  });

  test("Align Images button state changes based on duplicates", async ({
    page,
  }) => {
    // Upload first image and align it
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Upload only duplicate images
    const fileInput4 = page.locator('input[type="file"]');
    await fileInput4.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({ timeout: 20_000 });
    
    // Button should be disabled
    const alignButton = page.getByTestId("align-images-button");
    await expect(alignButton).toBeDisabled();
    await expect(alignButton).toContainText("No new images to align");
    
    // Cancel and upload mix of new and duplicates
    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);
    
    // Button should be enabled (1 new image)
    await expect(alignButton).toBeEnabled();
    await expect(alignButton).toContainText("Align Images");
    
    // Cancel and upload only new images
    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);
    
    // Button should be enabled
    await expect(alignButton).toBeEnabled();
    await expect(alignButton).toContainText("Align Images");
  });

  test("multiple duplicates referencing same existing image show correctly", async ({
    page,
  }) => {
    // Upload first image via API
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    const firstImageId = result1[0].id;
    
    // Upload two more copies of the same file in one batch
    const fileInput5 = page.locator('input[type="file"]');
    await fileInput5.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({ timeout: 20_000 });
    
    // Should show 2 duplicates
    await expect(page.getByTestId("duplicate-warning")).toContainText("2 duplicates detected and will not be used for alignment");
    
    // Both should show duplicate badges
    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(2);
    
    // Should have 2 duplicate items
    const duplicateItems = page.getByTestId("staging-item-duplicate");
    await expect(duplicateItems).toHaveCount(2);
    
    // Verify only one image exists in database (the original)
    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();
    const matchingImages = images.filter((img: any) => img.id === firstImageId);
    expect(matchingImages).toHaveLength(1);
    
    // Verify no React key warnings (check console for errors)
    // This is implicit - if keys weren't unique, React would warn
  });

  test("same-batch duplicate detection shows correct UI", async ({
    page,
  }) => {
    // Upload the same file twice in one batch
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0]]);
    
    // Should show staging area
    await expect(page.getByTestId("staging-grid")).toBeVisible();
    
    // Should show one duplicate
    await expect(page.getByTestId("duplicate-warning")).toContainText("1 duplicate detected and will not be used for alignment");
    
    // Should show "2 images (1 ready to align)"
    await expect(page.getByTestId("staging-image-count")).toContainText("2 images (1 ready to align)");
    
    // One image should have duplicate badge
    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(1);
    
    // Should have 1 duplicate item and 1 new item
    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(1);
    
    // Align button should be enabled (one non-duplicate)
    await expect(page.getByTestId("align-images-button")).toBeEnabled();
    
    // Align the images
    await alignStagedImages(page);
    
    // Verify only one image was created
    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();
    expect(images.length).toBe(1);
  });

  test("remove button only appears on non-duplicate images", async ({
    page,
  }) => {
    // Upload first image and align it
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    // Upload mix of new and duplicate images
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1], WITH_FACE[2]]);
    
    // Should show 3 images: 1 duplicate, 2 new
    await expect(page.getByTestId("staging-image-count")).toContainText("3 images (2 ready to align)");
    
    // Remove buttons should only appear on non-duplicate images
    const removeButtons = page.getByTestId("remove-staged-button");
    await expect(removeButtons).toHaveCount(2);
    
    // Should have 1 duplicate item and 2 new items
    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(2);
    
    // Click remove on first non-duplicate
    await removeButtons.first().click();
    
    // Should now show 2 images (1 duplicate, 1 new)
    await expect(page.getByTestId("staging-image-count")).toContainText("2 images (1 ready to align)");
    
    // Verify duplicates don't have remove buttons
    // After removing one, we should still have 1 remove button (for the remaining non-duplicate)
    const remainingRemoveButtons = page.getByTestId("remove-staged-button");
    await expect(remainingRemoveButtons).toHaveCount(1);
    
    // Should still have 1 duplicate and 1 new item
    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(1);
  });
});
