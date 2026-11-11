import { test, expect, Page } from "@playwright/test";
import fs from "fs";
import { execFileSync } from "child_process";
import { deleteAllImages, WITH_FACE } from "../utils/helpers";

async function deleteAllFilters(page: Page) {
  const saved = await (await page.request.get("/api/filters")).json();
  for (const preset of saved) await page.request.delete(`/api/filters/${preset.id}`);
}

/** Mean RGB and mean channel spread (0 for a grey image) of the visible filtered canvas. */
async function canvasStats(page: Page) {
  return page.getByTestId("timelapse-filtered-frame").evaluate((canvas: HTMLCanvasElement) => {
    const copy = document.createElement("canvas");
    copy.width = canvas.width; copy.height = canvas.height;
    const ctx = copy.getContext("2d")!;
    ctx.drawImage(canvas, 0, 0);
    const data = ctx.getImageData(0, 0, copy.width, copy.height).data;
    let sum = 0, spread = 0, n = 0;
    for (let i = 0; i < data.length; i += 4 * 97) {
      sum += data[i] + data[i + 1] + data[i + 2];
      spread += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2]);
      n++;
    }
    return { mean: sum / n / 3, spread: spread / n };
  });
}

test.describe("Timelapse filters", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await deleteAllImages(page);
    await deleteAllFilters(page);
    for (const [index, file] of WITH_FACE.slice(0, 2).entries()) {
      const upload = await page.request.post("/api/images/upload", {
        multipart: { files: { name: `2020081${index}_120000.jpg`, mimeType: "image/jpeg", buffer: fs.readFileSync(file) } },
      });
      const images = await upload.json();
      await (await page.request.post("/api/images/align", { data: { image_ids: images.map((i: { id: number }) => i.id) } })).body();
    }
    await page.reload();
    // First run after the server boots also builds the frame/thumb variants.
    await expect(page.getByTestId("timelapse-frame")).toBeVisible({ timeout: 15_000 });
  });
  test.afterEach(async ({ page }) => {
    await deleteAllFilters(page);
    await deleteAllImages(page);
  });

  test("a chip changes the playing preview immediately; Original removes it", async ({ page }) => {
    await expect(page.getByTestId("play-pause-button")).toHaveAttribute("aria-label", "Pause");
    await expect(page.getByTestId("timelapse-filtered-frame")).toHaveCount(0);
    await page.getByTestId("filter-chip-mono").click();
    await expect(page.getByTestId("filter-chip-mono")).toHaveAttribute("aria-checked", "true");
    await expect(page.getByTestId("timelapse-filtered-frame")).toBeVisible();
    await expect.poll(async () => (await canvasStats(page)).spread).toBeLessThan(1);  // grey while still playing
    await page.getByTestId("filter-chip-vivid").click();
    await expect.poll(async () => (await canvasStats(page)).spread).toBeGreaterThan(5);
    await page.getByTestId("filter-chip-original").click();
    await expect(page.getByTestId("timelapse-filtered-frame")).toHaveCount(0);
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
  });

  test("create, edit, duplicate and delete filters; they persist after reload", async ({ page }) => {
    await page.getByTestId("play-pause-button").click();
    await page.getByTestId("filter-new").click();
    await expect(page.getByTestId("filter-editor")).toBeVisible();
    await expect(page.getByTestId("filter-picker").getByRole("radio").first()).toBeDisabled();
    await page.getByTestId("filter-name").fill("Golden hour");
    await page.getByTestId("filter-warmth").fill("0.6");
    await expect(page.getByTestId("filter-warmth-value")).toHaveText("60");
    await expect(page.getByTestId("timelapse-filtered-frame")).toBeVisible();  // live preview
    await page.getByTestId("filter-tint-color").fill("#ff8800");
    await page.getByTestId("filter-tint-blend").selectOption("overlay");
    await page.getByTestId("filter-tint-strength").fill("0.4");
    await page.getByTestId("filter-grain-amount").fill("0.3");
    await page.getByTestId("filter-save").click();
    await expect(page.getByTestId("filter-editor")).toHaveCount(0);
    const chip = page.getByRole("radio", { name: "Golden hour", exact: true });
    await expect(chip).toHaveAttribute("aria-checked", "true");

    // Duplicate names are refused and the draft is kept.
    await page.getByTestId("filter-duplicate").click();
    await page.getByTestId("filter-name").fill("golden HOUR");
    await page.getByTestId("filter-save").click();
    await expect(page.getByTestId("filter-error")).toContainText("already exists");
    await page.getByTestId("filter-name").fill("Golden hour two");
    await page.getByTestId("filter-save").click();
    await expect(page.getByRole("radio", { name: "Golden hour two", exact: true })).toHaveAttribute("aria-checked", "true");

    // Edit, and Cancel restores the previous look.
    await chip.click();
    await page.getByTestId("filter-edit").click();
    await page.getByTestId("filter-fade").fill("0.9");
    await page.getByTestId("filter-cancel").click();
    await expect(chip).toHaveAttribute("aria-checked", "true");
    await page.getByTestId("filter-edit").click();
    await page.getByTestId("filter-name").fill("Dusk");
    await page.getByTestId("filter-fade").fill("0.5");
    await page.getByTestId("filter-save").click();

    await page.reload();
    await expect(page.getByRole("radio", { name: "Dusk", exact: true })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Golden hour two", exact: true })).toBeVisible();
    const saved = await (await page.request.get("/api/filters")).json();
    const dusk = saved.find((p: { name: string }) => p.name === "Dusk");
    expect(dusk.definition).toMatchObject({ warmth: 0.6, fade: 0.5, tint: { color: "#ff8800", blend: "overlay", strength: 0.4 }, grain: { amount: 0.3 } });

    // Delete asks first; the look stays applied as an unsaved copy.
    await page.getByRole("radio", { name: "Dusk", exact: true }).click();
    await page.getByTestId("filter-edit").click();
    await page.getByTestId("filter-delete").click();
    await expect(page.getByTestId("filter-delete-dialog")).toBeVisible();
    await page.getByTestId("filter-delete-confirm").click();
    await expect(page.getByRole("radio", { name: "Dusk", exact: true })).toHaveCount(0);
    await expect(page.getByTestId("filter-unsaved")).toBeVisible();
    await expect(page.getByTestId("timelapse-filtered-frame")).toBeVisible();
  });

  test("controls are locked while a save is in flight", async ({ page }) => {
    let release!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    await page.route("**/api/filters", async route => {
      if (route.request().method() === "POST") await held;
      await route.continue();
    });
    await page.getByTestId("filter-new").click();
    await page.getByTestId("filter-name").fill("Slow save");
    await page.getByTestId("filter-warmth").fill("0.4");
    await page.getByTestId("filter-save").click();
    await expect(page.getByTestId("filter-save")).toHaveText("Saving…");
    for (const id of ["filter-name", "filter-warmth", "filter-tint-color", "filter-tint-blend", "filter-grain-amount"])
      await expect(page.getByTestId(id)).toBeDisabled();
    release();
    await expect(page.getByTestId("filter-editor")).toHaveCount(0);
    const saved = await (await page.request.get("/api/filters")).json();
    expect(saved.map((p: { definition: { warmth: number } }) => p.definition.warmth)).toEqual([0.4]);
  });

  test("the download uses the selected filter and an export preset remembers it", async ({ page }) => {
    await page.getByTestId("play-pause-button").click();
    await page.getByTestId("filter-chip-mono").click();

    // Saved export presets keep a copy of the look.
    await page.getByText("Choose photos & export presets").click();
    await page.getByLabel("Export preset name").fill("Mono weekly");
    await page.getByRole("button", { name: "Save preset" }).click();
    await page.getByTestId("filter-chip-original").click();
    await page.getByRole("button", { name: "Mono weekly", exact: true }).click();
    await expect(page.getByTestId("filter-chip-mono")).toHaveAttribute("aria-checked", "true");

    const request = page.waitForRequest(req => req.url().includes("/api/video/generate?") && req.method() === "POST");
    const download = page.waitForEvent("download");
    await page.getByTestId("download-video-button").click();
    expect((await request).postDataJSON().filter).toMatchObject({ grayscale: 1, contrast: 1.1 });
    const file = await (await download).path();
    const raw = execFileSync("ffmpeg", ["-v", "error", "-i", file!, "-vf", "crop=900:1200:150:150", "-frames:v", "1",
      "-f", "rawvideo", "-pix_fmt", "rgb24", "pipe:1"], { maxBuffer: 8 * 1024 * 1024 });
    let spread = 0, n = 0;
    for (let i = 0; i < raw.length; i += 3 * 101, n++) spread += Math.max(raw[i], raw[i + 1], raw[i + 2]) - Math.min(raw[i], raw[i + 1], raw[i + 2]);
    expect(spread / n).toBeLessThan(4);  // grey photo (allowing for yuv420 chroma noise)

    // Original sends no filter at all.
    await page.getByTestId("filter-chip-original").click();
    const plain = page.waitForRequest(req => req.url().includes("/api/video/generate?") && req.method() === "POST");
    await page.getByTestId("download-video-button").click();
    expect((await plain).postDataJSON()).toEqual({ filter: null });
  });

  test("without WebGL2 the plain photo shows with a note", async ({ page }) => {
    await page.addInitScript(() => {
      const original = HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error narrowing the overloads is not worth it in a test stub
      HTMLCanvasElement.prototype.getContext = function (type: string, ...rest: unknown[]) {
        return type === "webgl2" ? null : original.call(this, type, ...rest);
      };
    });
    await page.reload();
    await page.getByTestId("filter-chip-noir").click();
    await expect(page.getByTestId("filter-preview-unavailable")).toBeVisible();
    await expect(page.getByTestId("timelapse-frame")).toBeVisible();
    await expect(page.getByTestId("timelapse-filtered-frame")).toHaveCount(0);
  });
});
