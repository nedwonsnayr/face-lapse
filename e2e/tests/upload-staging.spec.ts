import { test, expect } from "@playwright/test";
import { deleteAllImages, NO_FACE, uploadAndStage } from "../utils/helpers";

test.describe("Face Lapse – upload & staging", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("upload files shows staging area with correct count", async ({ page }) => {
    await uploadAndStage(page, NO_FACE);
    await expect(page.getByTestId("staging-image-count")).toContainText(
      "3 images (3 ready to align)"
    );
    await expect(page.getByTestId("cancel-staged-button")).toBeVisible();
    await expect(page.getByTestId("align-images-button")).toBeVisible();
  });

  test("cancel staged uploads returns to idle", async ({ page }) => {
    await uploadAndStage(page, [NO_FACE[0]]);
    await page.getByTestId("cancel-staged-button").click();
    await expect(page.getByTestId("dropzone-text")).toBeVisible();
  });
});
