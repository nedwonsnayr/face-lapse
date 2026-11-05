import fs from "fs";
import { test, expect } from "@playwright/test";
import { deleteAllImages, WITH_FACE } from "../utils/helpers";

test.describe("Face Lapse – timelapse order", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
  });

  test.afterEach(async ({ page }) => {
    await deleteAllImages(page);
  });

  test("plays oldest to newest by date taken; drags change it, Newest first doesn't", async ({ page }) => {
    // Uploaded out of date order; the date comes from the filename.
    const uploads = [
      ["20220301_120000.jpg", WITH_FACE[0]],
      ["20200301_120000.jpg", WITH_FACE[1]],
      ["20210301_120000.jpg", WITH_FACE[2]],
    ];
    const ids: number[] = [];
    for (const [name, file] of uploads) {
      const res = await page.request.post("/api/images/upload", {
        multipart: { files: { name, mimeType: "image/jpeg", buffer: fs.readFileSync(file) } },
      });
      expect(res.ok()).toBeTruthy();
      ids.push(...(await res.json()).map((img: { id: number }) => img.id));
    }
    const aligned = await page.request.post("/api/images/align", { data: { image_ids: ids } });
    expect(aligned.ok()).toBeTruthy();
    await aligned.body();
    const [y2022, y2020, y2021] = ids;

    const overlay = page.getByTestId("timelapse-date-overlay");
    const cards = page.getByTestId("previously-processed-group").locator('[data-testid^="previous-image-card-"]');
    const expectPlayback = async (years: string[]) => {
      const play = page.getByTestId("play-pause-button");
      if ((await play.getAttribute("aria-label")) === "Pause") await play.click();
      await expect(play).toHaveAttribute("aria-label", "Play");
      await page.getByTestId("timelapse-scrubber").fill("0");
      for (const [i, year] of years.entries()) {
        if (i) await page.getByTestId("step-forward-button").click();
        await expect(overlay).toContainText(year);
      }
    };

    // No drags yet: date order everywhere.
    await page.reload();
    await expect(cards.first()).toHaveAttribute("data-testid", `previous-image-card-${y2020}`);
    await expectPlayback(["2020", "2021", "2022"]);

    // A drag (saved positions) moves the 2022 photo first, in the library and the timelapse.
    const reorder = await page.request.patch("/api/images/reorder", {
      data: [y2022, y2020, y2021].map((id, i) => ({ id, sort_order: i })),
    });
    expect(reorder.ok()).toBeTruthy();
    await page.reload();
    await expect(cards.first()).toHaveAttribute("data-testid", `previous-image-card-${y2022}`);
    await expectPlayback(["2022", "2020", "2021"]);

    // "Newest first" flips only the library.
    await page.getByRole("button", { name: /oldest first/i }).click();
    await expect(cards.first()).toHaveAttribute("data-testid", `previous-image-card-${y2021}`);
    await expectPlayback(["2022", "2020", "2021"]);
  });
});
