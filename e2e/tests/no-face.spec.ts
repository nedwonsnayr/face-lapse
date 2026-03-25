import { test, expect } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  NO_FACE,
  uploadAndStage,
} from "../utils/helpers";

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
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    await expect(page.getByTestId("alignment-result-failed")).toContainText(
      "3 face not detected"
    );

    await expect(page.getByTestId("no-face-group")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("no-face-group")).toContainText("(3)");

    await expect(page.getByTestId("dismiss-all-button")).toBeVisible();
    await expect(page.getByTestId("empty-timelapse-message")).toBeVisible();
  });

  test("dismiss all removes no-face images", async ({ page }) => {
    await uploadAndStage(page, NO_FACE);
    await alignStagedImages(page);

    page.on("dialog", (dialog) => dialog.accept());
    await page.getByTestId("dismiss-all-button").click();

    await expect(page.getByTestId("no-face-group")).not.toBeVisible({
      timeout: 10_000,
    });
  });
});
