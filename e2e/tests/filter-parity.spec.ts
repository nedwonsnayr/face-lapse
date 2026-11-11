import { test, expect } from "@playwright/test";
import { execFileSync } from "child_process";
import path from "path";

/*
 * The playback shader and the export pipeline are two implementations of one
 * spec (.10x/specs/2026-11-10-timelapse-filters-design.md). Feed both the same
 * pixels and require every channel to agree within 2/255.
 */
const ROOT = path.resolve(__dirname, "..", "..");
const TOLERANCE = 2;

interface Reference {
  width: number; height: number; input: string;
  cases: { name: string; definition: unknown; frame: number; output: string }[];
}

test("WebGL preview matches the export pipeline for every control and built-in", async ({ page }) => {
  // Imports the renderer module directly, which only the Vite dev server serves.
  const module = await page.request.get("/src/filters/FilterRenderer.ts");
  test.skip(!module.ok(), "Needs the Vite dev server (not the production Docker image)");
  const reference: Reference = JSON.parse(execFileSync(
    path.join(ROOT, ".venv", "bin", "python"),
    [path.join(ROOT, "scripts", "filter_reference.py"), path.join(ROOT, "e2e", "fixtures", "face_1.jpg"),
      path.join(ROOT, "e2e", "fixtures", "filter-cases.json"), "320"],
    { cwd: ROOT, maxBuffer: 256 * 1024 * 1024 },
  ).toString());
  expect(reference.cases.length).toBeGreaterThan(30);

  await page.goto("/");
  const results: { name: string; maxDiff: number; over: number }[] = await page.evaluate(async (ref) => {
    const { FilterRenderer } = await import(/* @vite-ignore */ "/src/filters/FilterRenderer.ts");
    const decode = (b64: string) => Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const canvas = document.createElement("canvas");
    const renderer = new FilterRenderer(canvas);
    renderer.setPixels(decode(ref.input), ref.width, ref.height);
    return ref.cases.map(({ name, definition, frame, output }) => {
      renderer.render(definition, frame);
      const actual = renderer.readPixels();
      const expected = decode(output);
      let maxDiff = 0, over = 0;
      for (let i = 0, j = 0; j < expected.length; i += 4, j += 3) {
        for (let k = 0; k < 3; k++) {
          const diff = Math.abs(actual[i + k] - expected[j + k]);
          if (diff > maxDiff) maxDiff = diff;
          if (diff > 2) over++;
        }
      }
      return { name, maxDiff, over };
    });
  }, reference);

  for (const result of results) {
    expect.soft(result.maxDiff, `${result.name}: ${result.over} channel values off by more than ${TOLERANCE}`)
      .toBeLessThanOrEqual(TOLERANCE);
  }
  console.log(results.map(r => `${r.name}: max ${r.maxDiff}`).join("\n"));
});
