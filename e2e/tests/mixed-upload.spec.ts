import { test, expect } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  NO_FACE,
  uploadAndStage,
  WITH_FACE,
} from "../utils/helpers";

test.describe("Face Lapse – mixed upload (face + no face)", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("mixed batch shows both aligned and no-face groups", async ({ page }) => {
    await uploadAndStage(page, [NO_FACE[0], WITH_FACE[0]]);
    await alignStagedImages(page);

    await expect(page.getByTestId("alignment-result-success")).toBeVisible();
    await expect(page.getByTestId("alignment-result-failed")).toBeVisible();

    await expect(page.getByTestId("no-face-group")).toBeVisible({
      timeout: 10_000,
    });

    await expect(page.getByTestId("play-pause-button")).toBeVisible();
  });
});
