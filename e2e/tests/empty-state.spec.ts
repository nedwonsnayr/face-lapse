import { test, expect } from "@playwright/test";
import { deleteAllImages } from "../utils/helpers";

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
