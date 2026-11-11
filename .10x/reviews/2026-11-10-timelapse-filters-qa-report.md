# QA report: timelapse-filters (2026-11-10)
**Verdict:** ready for PR.

## Results
| Suite | Result |
|---|---|
| Backend unit tests (`make test-backend`) | 69 / 69 pass |
| Frontend build (`tsc -b && vite build`) | Clean |
| Playwright full suite | 74 / 74 pass (69 existing + parity + 4 filters) |
| Parity spec (33 cases) | Max diff 1/255; grain bit-identical |
| Filters spec, repeated ×2 | 8 / 8 |

## Manual pass
- **Browser pane, isolated data dir, ports 5222/8222:**
  - Desktop two-pane: chip thumbnails render each look, the canvas overlays the `<img>` exactly (600×800), and the editor pins the player.
  - 375 px dark and light: the pinned 170 px player stays visible while sliders move, and the tint colour/blend row wraps cleanly.
- **Filtered export:** a Film copy with B&W and vignette 0.8 shows grey, vignette and grain on the photo, and the paper and date caption are unchanged.

## Issues found and fixed during QA
1. The `--use-angle=swiftshader` launch flag broke `canvas.captureStream`, which made the camera-capture test fail 3/3. The suite now uses only `--enable-unsafe-swiftshader`; it passed 2/2 alone and in the full run.
2. The pinned player was too tall on phones. Fixed: `min-width: 0` and 170 px.
3. A cold-start wait for the first frame in `filters.spec`. Fixed: a 15 s timeout.

## Measurements and risks for ops
- **Filtered export:** about 100–150 ms per frame extra on an M-series Mac. On the VM, a 1,000-frame export could gain about 2–4 minutes.
- **MP4 size:** grain makes files 3.6× larger at 0.45 and 6.3× at maximum. Unfiltered and identity exports are unchanged (same cache entry, same bytes).
- **Housekeeping:** the e2e harness still leaves its 5111/8111 servers running after a run. This is pre-existing; they were stopped by hand.
