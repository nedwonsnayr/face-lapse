# QA: timelapse-prefetch
- **Root cause measured in production** (Chrome, 2026-11-11, speed 0.05 s):
  - Gaps between frames: p50 100 ms, p90 150 ms.
  - Frame fetch: p50 46 ms, p90 about 200 ms, max about 500 ms.
  - The Film filter showed no measurable cost.
- **A/B on your library**, with a local proxy adding 50 ms of latency (600 ms on 12% of requests), 20 s each from a cold cache:

| Build | fps (target 20) | gaps > 200 ms | p99 | max | "Loading frame…" |
|---|---|---|---|---|---|
| main (before) | 11.4 | 16 | 420 ms | 443 ms | 0 |
| timelapse-prefetch | 16.6 | 0 | 62 ms | 63 ms | 0 |

- **New tests:** `frame-prefetch.spec.ts`, 4 of 4 passing.
- **Full suite and build:** see reviews/2026-11-11-timelapse-prefetch-qa-report.md.
- **Regression risk:** low. The playback contract (wait for a decoded frame) is unchanged, and the retry UI is untouched.
