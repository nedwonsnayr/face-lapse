# Senior Engineer: timelapse-prefetch
1. **`framePrefetch.ts`:**
   - `want(urls)` aborts in-flight requests that are no longer wanted, rebuilds the queue in priority order skipping done and in-flight URLs, then fills up to the concurrency cap.
   - Each request is `fetch(url, { credentials: "same-origin", priority: "low", signal })` and drains the body with `arrayBuffer()`, so the response is committed to the cache.
   - Only an OK, fully read response is marked done.
2. **`Timelapse.tsx`:**
   - `DECODE_AHEAD = 8`.
   - The prefetch list is indices `safeIndex + 9 … safeIndex + prefetchCount`, wrapping around and capped at `images.length - 1`.
   - It is passed through a `useEffect` keyed on the joined URL string, so it doesn't run on unrelated re-renders.
3. **`BufferedFrame.tsx`:** raise the cache cap from 12 to 16.
4. **Tests:**
   - Playwright imports `/src/framePrefetch.ts` from the Vite dev server, using the filter-parity pattern, and checks the concurrency cap, order, abort and no refetch.
   - A player test checks that a paused player prefetches past the decode window.
- **Tricky bits:** the fake fetch must honor `AbortSignal`. Also, `priority` is ignored by Safari, which is harmless.
