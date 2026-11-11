# SDE: playback-cadence (built)
- **The bug:** the player re-armed a full `setInterval(frameDuration)` only after each frame was decoded and rendered. Every frame was stretched by that overhead, about 4–10 ms locally and more on slow devices: 0.05 s played at 54–60 ms per frame.
- **The fix:**
  - `frontend/src/playbackClock.ts` adds `nextAdvanceDelay(lastAdvanceAt, now, durationMs)`. It times the next advance from the previous advance.
  - A frame that arrives with less than half its time left gets a full duration instead, which covers a stall, a resume after pause and a late decode. Every frame is visible for at least half the set duration.
  - In `Timelapse.tsx`, a one-shot `setTimeout` per frame replaces the re-armed `setInterval`. `lastAdvanceAt` is a ref.
- **Tests:** `e2e/tests/playback-clock.spec.ts` covers on-time, the half boundary, late, stalled, resumed and first frame.
- **Behavior note:** a one-photo selection now schedules a single no-op advance and stops, instead of an endless interval. Nothing visible changes.
- No ADR: this is a timing bug fix within ADR-013's playback contract.
