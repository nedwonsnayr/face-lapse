/**
 * How long to keep the current frame before advancing.
 *
 * The player advances, waits for the new frame to be decoded, then schedules
 * the next advance. Timing from the previous advance (not from "ready") keeps
 * the set speed: a frame that is ready a few ms after the advance still moves
 * on exactly one duration later.
 *
 * A frame that arrives late (a stall, or play pressed after a pause) gets a
 * full duration from now instead of flashing by; so does one that arrives with
 * less than half its time left. Every frame is shown for at least half the
 * set duration.
 */
export function nextAdvanceDelay(lastAdvanceAt: number, now: number, durationMs: number): number {
  const remaining = lastAdvanceAt + durationMs - now;
  return remaining >= durationMs / 2 ? remaining : durationMs;
}
