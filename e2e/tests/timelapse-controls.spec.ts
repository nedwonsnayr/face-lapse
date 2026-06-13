import { test, expect } from "@playwright/test";
import {
  alignStagedImages,
  deleteAllImages,
  uploadAndStage,
  WITH_FACE,
} from "../utils/helpers";

test.describe("Timelapse playback controls", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await page.reload();

    await uploadAndStage(page, WITH_FACE);
    await alignStagedImages(page);

    await expect(page.getByTestId("play-pause-button")).toBeVisible({
      timeout: 10_000,
    });
    await expect(page.getByTestId("frame-counter")).toHaveText("1 / 3");
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("step buttons are disabled while playing", async ({ page }) => {
    await expect(page.getByTestId("play-pause-button")).toHaveText("⏸");

    await expect(page.getByTestId("step-backward-button")).toBeDisabled();
    await expect(page.getByTestId("step-forward-button")).toBeDisabled();
  });

  test("step buttons move one frame when paused", async ({ page }) => {
    await page.getByTestId("play-pause-button").click();
    await expect(page.getByTestId("play-pause-button")).toHaveText("▶");

    await page.getByTestId("timelapse-scrubber").fill("1");
    await expect(page.getByTestId("frame-counter")).toHaveText("2 / 3");

    await page.getByTestId("step-forward-button").click();
    await expect(page.getByTestId("frame-counter")).toHaveText("3 / 3");

    await page.getByTestId("step-backward-button").click();
    await expect(page.getByTestId("frame-counter")).toHaveText("2 / 3");
  });

  test("step backward is disabled on the first frame when paused", async ({
    page,
  }) => {
    await page.getByTestId("play-pause-button").click();
    await page.getByTestId("timelapse-scrubber").fill("0");

    await expect(page.getByTestId("frame-counter")).toHaveText("1 / 3");
    await expect(page.getByTestId("step-backward-button")).toBeDisabled();
    await expect(page.getByTestId("step-forward-button")).toBeEnabled();
  });

  test("step forward is disabled on the last frame when paused", async ({
    page,
  }) => {
    await page.getByTestId("play-pause-button").click();
    await page.getByTestId("timelapse-scrubber").fill("2");

    await expect(page.getByTestId("frame-counter")).toHaveText("3 / 3");
    await expect(page.getByTestId("step-forward-button")).toBeDisabled();
    await expect(page.getByTestId("step-backward-button")).toBeEnabled();
  });
});
