import { test, expect } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  uploadAndStage,
  uploadFileViaAPI,
  WITH_FACE,
} from "../utils/helpers";

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
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result1).toHaveLength(1);
    expect(result1[0]).toHaveProperty("id");
    expect(result1[0]).toHaveProperty("original_filename");
    const firstImageId = result1[0].id;
    const firstImageFilename = result1[0].original_filename;

    const result2 = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result2).toHaveLength(1);

    expect(result2[0]).toHaveProperty("skipped", true);
    expect(result2[0]).toHaveProperty("existing_id", firstImageId);
    expect(result2[0]).toHaveProperty("id", firstImageId);
    expect(result2[0]).toHaveProperty("original_filename", firstImageFilename);
  });

  test("uploading duplicate file results in only one image in database", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);

    const imagesRes1 = await page.request.get("/api/images");
    expect(imagesRes1.ok()).toBeTruthy();
    const images1 = await imagesRes1.json();
    const initialCount = images1.length;

    const result = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result[0]).toHaveProperty("skipped", true);

    const imagesRes2 = await page.request.get("/api/images");
    expect(imagesRes2.ok()).toBeTruthy();
    const images2 = await imagesRes2.json();
    expect(images2.length).toBe(initialCount);
  });

  test("uploading duplicate in same batch is handled correctly", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0]]);

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "2 images (1 ready to align)"
    );

    await expect(page.getByTestId("duplicate-warning")).toContainText(
      "1 duplicate detected and will not be used for alignment"
    );

    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(1);
    await expect(page.getByTestId("align-images-button")).toBeEnabled();

    await alignStagedImages(page);

    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();

    const uniqueImages = new Set(images.map((img: any) => img.original_filename));
    expect(uniqueImages.size).toBeLessThanOrEqual(images.length);
  });

  test("uploading duplicate after alignment still prevents duplicate", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);

    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    const imagesRes1 = await page.request.get("/api/images");
    expect(imagesRes1.ok()).toBeTruthy();
    const images1 = await imagesRes1.json();
    const initialCount = images1.length;

    const result = await uploadFileViaAPI(page, WITH_FACE[0]);
    expect(result[0]).toHaveProperty("skipped", true);

    const imagesRes2 = await page.request.get("/api/images");
    expect(imagesRes2.ok()).toBeTruthy();
    const images2 = await imagesRes2.json();
    expect(images2.length).toBe(initialCount);
  });

  test("uploading different files with same content are detected as duplicates", async ({
    page,
  }) => {
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    const firstImageId = result1[0].id;

    const result2 = await uploadFileViaAPI(page, WITH_FACE[0]);

    expect(result2[0]).toHaveProperty("skipped", true);
    expect(result2[0]).toHaveProperty("existing_id", firstImageId);
  });

  test("duplicate badges and visual indicators appear correctly", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);

    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1], WITH_FACE[0]]);

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "3 images (1 ready to align)"
    );

    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(2);

    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(2);
    await expect(newItems).toHaveCount(1);
  });

  test("warning message displays correctly for duplicates", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0], WITH_FACE[1]]);

    await expect(page.getByTestId("duplicate-warning")).toContainText(
      "2 duplicates detected and will not be used for alignment"
    );

    await expect(page.getByTestId("duplicate-warning")).toBeVisible();

    await page.getByTestId("cancel-staged-button").click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);

    await expect(page.getByTestId("duplicate-warning")).not.toBeVisible();
  });

  test("image count displays correctly with duplicates", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0], WITH_FACE[1]]);

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "3 images (1 ready to align)"
    );

    await page.getByRole("button", { name: "Cancel" }).click();
    const fileInput3 = page.locator('input[type="file"]');
    await fileInput3.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "2 images"
    );
    await expect(page.getByTestId("staging-image-count")).not.toContainText(
      "ready to align"
    );

    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "2 images (2 ready to align)"
    );
  });

  test("Align Images button state changes based on duplicates", async ({
    page,
  }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    const fileInput4 = page.locator('input[type="file"]');
    await fileInput4.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({
      timeout: 20_000,
    });

    const alignButton = page.getByTestId("align-images-button");
    await expect(alignButton).toBeDisabled();
    await expect(alignButton).toContainText("No new images to align");

    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1]]);

    await expect(alignButton).toBeEnabled();
    await expect(alignButton).toContainText("Align Images");

    await page.getByRole("button", { name: "Cancel" }).click();
    await uploadAndStage(page, [WITH_FACE[1], WITH_FACE[2]]);

    await expect(alignButton).toBeEnabled();
    await expect(alignButton).toContainText("Align Images");
  });

  test("multiple duplicates referencing same existing image show correctly", async ({
    page,
  }) => {
    const result1 = await uploadFileViaAPI(page, WITH_FACE[0]);
    const firstImageId = result1[0].id;

    const fileInput5 = page.locator('input[type="file"]');
    await fileInput5.setInputFiles([WITH_FACE[0], WITH_FACE[0]]);
    await expect(page.getByTestId("staging-grid")).toBeVisible({
      timeout: 20_000,
    });

    await expect(page.getByTestId("duplicate-warning")).toContainText(
      "2 duplicates detected and will not be used for alignment"
    );

    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(2);

    const duplicateItems = page.getByTestId("staging-item-duplicate");
    await expect(duplicateItems).toHaveCount(2);

    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();
    const matchingImages = images.filter((img: any) => img.id === firstImageId);
    expect(matchingImages).toHaveLength(1);
  });

  test("same-batch duplicate detection shows correct UI", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[0]]);

    await expect(page.getByTestId("staging-grid")).toBeVisible();

    await expect(page.getByTestId("duplicate-warning")).toContainText(
      "1 duplicate detected and will not be used for alignment"
    );

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "2 images (1 ready to align)"
    );

    const duplicateBadges = page.getByTestId("duplicate-badge");
    await expect(duplicateBadges).toHaveCount(1);

    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(1);

    await expect(page.getByTestId("align-images-button")).toBeEnabled();
    await alignStagedImages(page);

    const imagesRes = await page.request.get("/api/images");
    expect(imagesRes.ok()).toBeTruthy();
    const images = await imagesRes.json();
    expect(images.length).toBe(1);
  });

  test("remove button only appears on non-duplicate images", async ({ page }) => {
    await uploadAndStage(page, [WITH_FACE[0]]);
    await alignStagedImages(page);
    await expect(page.getByTestId("alignment-result-success")).toBeVisible({
      timeout: 10_000,
    });

    await uploadAndStage(page, [WITH_FACE[0], WITH_FACE[1], WITH_FACE[2]]);

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "3 images (2 ready to align)"
    );

    const removeButtons = page.getByTestId("remove-staged-button");
    await expect(removeButtons).toHaveCount(2);

    const duplicateItems = page.getByTestId("staging-item-duplicate");
    const newItems = page.getByTestId("staging-item-new");
    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(2);

    await removeButtons.first().click();

    await expect(page.getByTestId("staging-image-count")).toContainText(
      "2 images (1 ready to align)"
    );

    const remainingRemoveButtons = page.getByTestId("remove-staged-button");
    await expect(remainingRemoveButtons).toHaveCount(1);

    await expect(duplicateItems).toHaveCount(1);
    await expect(newItems).toHaveCount(1);
  });
});
