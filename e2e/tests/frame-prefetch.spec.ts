import { test, expect } from "@playwright/test";
import fs from "fs";
import path from "path";

/*
 * ADR-013: the player downloads ~3 s of upcoming frames (network only) and
 * decodes the nearest 8. The module tests import the source from the Vite dev
 * server, like filter-parity.spec.ts.
 */

test.describe("FramePrefetcher", () => {
  test.beforeEach(async ({ page }) => {
    const module = await page.request.get("/src/framePrefetch.ts");
    test.skip(!module.ok(), "Needs the Vite dev server (not the production Docker image)");
    await page.goto("/");
  });

  test("window size scales with speed and is bounded", async ({ page }) => {
    const counts = await page.evaluate(async () => {
      const { prefetchCount } = await import("/src/framePrefetch.ts" as string);
      return [0.05, 0.1, 0.25, 0.5, 1].map(prefetchCount);
    });
    expect(counts).toEqual([60, 30, 12, 8, 8]);
  });

  test("fetches nearest first, caps concurrency, aborts what leaves the window and never refetches", async ({ page }) => {
    const log = await page.evaluate(async () => {
      const { FramePrefetcher } = await import("/src/framePrefetch.ts" as string);
      const events: string[] = [];
      const pending = new Map<string, () => void>();
      const fetcher = (url: string, init: RequestInit) => new Promise<Response>((resolve, reject) => {
        events.push(`start ${url}`);
        init.signal!.addEventListener("abort", () => { events.push(`abort ${url}`); reject(new DOMException("aborted", "AbortError")); });
        pending.set(url, () => resolve(new Response("x")));
      });
      const tick = () => new Promise(r => setTimeout(r, 30));
      const p = new FramePrefetcher(2, 2000, fetcher);

      p.want(["a", "b", "c", "d"]);
      const firstInflight = p.stats.inflight;
      pending.get("a")!(); await tick();             // a done → c starts
      const afterA = p.stats.inflight;
      p.want(["c", "d", "e"]);                         // b left the window
      const afterSlide = p.stats.inflight;
      pending.get("c")!(); pending.get("d")!(); await tick();
      pending.get("e")!(); await tick();
      p.want(["a", "c", "d", "e"]);                    // all done: nothing restarts
      await tick();
      const final = p.stats;
      p.dispose();
      return { events, firstInflight, afterA, afterSlide, final };
    });
    expect(log.firstInflight).toEqual(["a", "b"]);
    expect(log.afterA).toEqual(["b", "c"]);
    expect(log.events).toContain("abort b");
    expect(log.afterSlide).toEqual(["c", "d"]);
    expect(log.events.filter(e => e.startsWith("start"))).toEqual(["start a", "start b", "start c", "start d", "start e"]);
    expect(log.final).toEqual({ done: 4, inflight: [], queued: 0 });
  });

  test("a failed prefetch is retried when it is wanted again", async ({ page }) => {
    const starts = await page.evaluate(async () => {
      const { FramePrefetcher } = await import("/src/framePrefetch.ts" as string);
      let starts = 0;
      const fetcher = () => { starts++; return Promise.resolve(new Response("", { status: 502 })); };
      const p = new FramePrefetcher(2, 2000, fetcher);
      p.want(["a"]); await new Promise(r => setTimeout(r, 10));
      p.want(["a"]); await new Promise(r => setTimeout(r, 10));
      return starts;
    });
    expect(starts).toBe(2);
  });
});

test("a paused player downloads frames beyond the decode window", async ({ page }) => {
  const module = await page.request.get("/src/framePrefetch.ts");
  test.skip(!module.ok(), "Needs the Vite dev server (not the production Docker image)");
  const jpeg = fs.readFileSync(path.join(__dirname, "..", "fixtures", "face_1.jpg"));
  const records = Array.from({ length: 30 }, (_, i) => ({
    id: 9000 + i, profile_id: 1, original_filename: `f${i}.jpg`, source_filename: null, face_detected: true,
    included_in_video: true, photo_taken_at: `2020-01-${String(1 + (i % 28)).padStart(2, "0")}T12:00:00`,
    date_source: "exif", created_at: null, has_aligned: true, sort_order: i, pending: false,
    needs_face_selection: false, selected_face_index: null, content_hash: `h${i}`,
  }));
  await page.route(/\/api\/images\?/, route => route.fulfill({ json: records }));
  const requested = new Set<number>();
  await page.route(/\/api\/images\/\d+\/aligned\?/, route => {
    const url = new URL(route.request().url());
    if (url.searchParams.get("size") === "frame") requested.add(Number(url.pathname.split("/")[3]));
    return route.fulfill({ body: jpeg, contentType: "image/jpeg", headers: { "Cache-Control": "private, max-age=31536000, immutable" } });
  });
  await page.addInitScript(() => localStorage.setItem("face-lapse:settings", JSON.stringify({ autoplay: false, frameDuration: 0.05 })));
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toHaveText("1 / 30");
  // 0.05 s/frame → 60-frame window, capped at the other 29 frames. 8 are decoded, the rest prefetched.
  await expect.poll(() => requested.size, { timeout: 10_000 }).toBe(30);
  await expect(page.getByTestId("frame-counter")).toHaveText("1 / 30");
});
