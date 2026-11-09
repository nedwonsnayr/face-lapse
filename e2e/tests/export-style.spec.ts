import { test, expect } from "@playwright/test";
import fs from "fs";
import { execFileSync } from "child_process";
import { deleteAllImages, WITH_FACE } from "../utils/helpers";

test.use({ timezoneId: "America/New_York" });

test.describe("Styled export and independent captions", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    const upload = await page.request.post("/api/images/upload", {
      multipart: { files: { name: "20200819_120000.jpg", mimeType: "image/jpeg", buffer: fs.readFileSync(WITH_FACE[0]) } },
    });
    const images = await upload.json();
    const align = await page.request.post("/api/images/align", { data: { image_ids: images.map((image: any) => image.id) } });
    await align.body();
    await page.reload();
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
    await page.getByTestId("play-pause-button").click();
  });
  test.afterEach(async ({ page }) => { await deleteAllImages(page); });

  for (const [dates, age] of [[true, true], [true, false], [false, true], [false, false]]) {
    test(`preview and downloaded MP4: date=${dates}, age=${age}`, async ({ page }) => {
      await page.getByTestId("show-dates-toggle").setChecked(dates);
      await expect(page.getByTestId("show-age-toggle")).toBeEnabled();
      await page.getByTestId("show-age-toggle").setChecked(age);
      if (age) await expect(page.getByTestId("birthday-input")).toBeEnabled();
      else await expect(page.getByTestId("birthday-input")).toBeDisabled();
      if (dates) await expect(page.getByTestId("timelapse-date-overlay")).toHaveText("August 19, 2020");
      else await expect(page.getByTestId("timelapse-date-overlay")).toHaveCount(0);
      if (age) await expect(page.getByTestId("timelapse-age-overlay")).toHaveText("Age 24");
      else await expect(page.getByTestId("timelapse-age-overlay")).toHaveCount(0);

      const request = page.waitForRequest((req) => req.url().includes("/api/video/generate?") && req.method() === "POST");
      const download = page.waitForEvent("download");
      await page.getByTestId("download-video-button").click();
      const params = new URL((await request).url()).searchParams;
      expect(params.get("show_dates")).toBe(String(dates));
      expect(params.get("show_age")).toBe(String(age));
      expect(params.get("birthday")).toBe(age ? "1995-10-06" : null);
      const file = await (await download).path();
      expect(file).toBeTruthy();
      const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file!, "-vf", "crop=1200:200:0:1500", "-frames:v", "1", "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 2 * 1024 * 1024 });
      let datePixels = 0, agePixels = 0;
      for (let i = 0; i < raw.length; i += 3) {
        const [r, g, b] = [raw[i], raw[i + 1], raw[i + 2]];
        if (r < 110 && g < 110 && b < 110) datePixels++;
        if (r > 120 && g < 120 && b < 110) agePixels++;
      }
      expect(datePixels > 100).toBe(dates);
      expect(agePixels > 100).toBe(age);
      await page.screenshot({ path: `test-results/captions-date-${dates}-age-${age}.png` });
    });
  }

  test("birthday picker preserves the chosen calendar day east of UTC", async ({ browser }) => {
    const context = await browser.newContext({ timezoneId: "Pacific/Auckland", baseURL: "http://localhost:5111" });
    try {
      const page = await context.newPage();
      await page.goto("/");
      const birthday = page.getByTestId("birthday-input");
      await expect(birthday).toHaveValue("Oct 6, 1995");
      await birthday.click();
      await page.getByRole("button", { name: "6", exact: true }).click();
      await expect(birthday).toHaveValue("Oct 6, 1995");
    } finally {
      await context.close();
    }
  });
});
