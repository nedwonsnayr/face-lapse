import { test, expect } from "@playwright/test";

/*
 * Playback cadence: the next advance is timed from the previous advance, so
 * decode/render time doesn't stretch every frame. Imports the source from the
 * Vite dev server, like filter-parity.spec.ts.
 */
test("next advance keeps the set cadence and never flashes a late frame", async ({ page }) => {
  const module = await page.request.get("/src/playbackClock.ts");
  test.skip(!module.ok(), "Needs the Vite dev server (not the production Docker image)");
  await page.goto("/");
  const delays = await page.evaluate(async () => {
    const { nextAdvanceDelay } = await import("/src/playbackClock.ts" as string);
    return {
      readyQuickly: nextAdvanceDelay(1000, 1010, 50),     // frame on screen 10 ms after the advance
      readyAtHalf: nextAdvanceDelay(1000, 1025, 50),      // exactly half left: keep cadence
      readyLate: nextAdvanceDelay(1000, 1030, 50),        // under half left: full duration
      stalled: nextAdvanceDelay(1000, 1600, 50),          // stalled past the deadline
      resumed: nextAdvanceDelay(0, 99_999, 250),          // play pressed after a long pause
      firstFrame: nextAdvanceDelay(0, 5, 100),            // initial lastAdvanceAt (0) right after load
    };
  });
  expect(delays).toEqual({ readyQuickly: 40, readyAtHalf: 25, readyLate: 50, stalled: 50, resumed: 250, firstFrame: 95 });
});
