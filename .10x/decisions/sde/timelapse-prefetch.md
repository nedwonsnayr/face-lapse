# SDE: timelapse-prefetch (built)
## What was built
- **`frontend/src/framePrefetch.ts`:** `FramePrefetcher` and `prefetchCount`.
  - The window is `ceil(3 s / frameDuration)` frames, clamped to 8–60.
  - Requests run nearest first, at most 6 at once, at low priority and same-origin.
  - Each body is drained so the response lands in the HTTP cache.
  - Requests that leave the window are aborted. A bounded done set (2000 URLs) prevents refetching, and failures are retried when wanted again.
- **`Timelapse.tsx`:**
  - One memoized `upcoming` list. The first `DECODE_AHEAD = 8` go to `BufferedFrame` for decoding (was 4); the rest go to the prefetcher via an effect keyed on the joined URLs.
  - The prefetcher is created and disposed in a mount effect, which is StrictMode-safe.
- **`BufferedFrame.tsx`:** the decoded cache cap goes from 12 to 16.
- **Tests:** `e2e/tests/frame-prefetch.spec.ts` has 4 tests:
  - module tests for window size, order, concurrency, abort, no refetch and retry after failure
  - a player test showing a paused player with 30 frames downloads all of them, where before it fetched 5
## Deviations
- None from ADR-013.
## Tech debt and notes
- **Cadence overhead (pre-existing):** each tick restarts the interval after the frame is ready. At 0.05 s/frame that plays at about 60 ms per frame (16.6 fps) instead of 50 ms. Scheduling against a deadline would recover it. This was left out of scope.
- **Prefetch with nobody watching:** the prefetch runs while paused, about 2.7 MB at the default speed. That's acceptable for a personal app.
