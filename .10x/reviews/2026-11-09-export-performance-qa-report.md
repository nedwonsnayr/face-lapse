# Export performance analysis and verification — 2026-11-09

## Findings and decision
Production baseline: 1,043 frames took 265.2s. Request latency was video preparation, before download transfer. Review found identical 1200x1800 shadow/mat composition and font loading repeated per frame, unconditional new encoding per request, unbounded concurrent jobs, and no phase visibility. Existing MP4 encoding already uses medium/CRF23 and exact rational cadence.

Selected improvements: memoize static canvas/fonts with a fresh copy per frame; reuse identical running/completed requests by ordered source identities, revision/stat, visible caption data and speed; admit one distinct export at a time; report render counts and encoding phase; log phase timings. Preserved resolution, JPEG quality, H.264 preset/CRF, caption layout and all original media.

Deferred alternatives: faster preset needs a representative quality/size study; parallel frame processing competes with encoding/API on four cores and increases memory; raw-frame streaming removes temporary JPEG I/O but complicates cancellation/backpressure/timeout handling and changes input compression; persistent cache/worker queue adds retention/migration/recovery complexity. Existing completed MP4 disk retention is unchanged. These are follow-ups only if phase telemetry justifies them.

## Measurements
- macOS, 45 public-fixture frames: render-only 1.856s → 0.582s; full export 2.852s → 1.523s; identical output sizes 232,155 bytes.
- Existing ARM server, separate temporary process, 60 public-fixture photos normalized to 1200x1600: full export 16.320s → 8.705s (46.7% less time, 1.87x throughput). Optimized render/JPEG 4.51s, encoding 4.19s. Identical output sizes 252,269 bytes. All four caption modes pixel-identical before encoding on both platforms.
- These are small repeated public fixtures, not a measured post-change 1,043-photo library run. Do not extrapolate an exact full-library duration. Server benchmark changed no installed code or personal data and cleaned all temporary outputs.

## Verification
29 backend tests passed in 3.464s. 49 Chromium tests passed in 46.2s. Production TypeScript/Vite build and diff whitespace check passed. Tests cover four caption combinations and decoded MP4s, frame count/cadence, source preservation, background immutability, progress order, running/completed reuse, key invalidation (source/revision/order/inclusion/date/age/speed), deleted outputs, failed jobs, source changes mid-export, bounded registry and thread-start recovery. Browser tests exercise real repeat-export reuse and render/encode/error display.

Initial sandboxed detector suite could not access macOS graphics; rerun with graphics access passed, using a disposable DB. No production library tests or private media uploaded.

## Operational limits
Reuse is process-local and bounded to the latest 20 retained jobs; restart/eviction regenerates. A different export while one runs receives a clear retryable 409. Progress deliberately does not invent encoding percentages or ETA. Existing restart interruption and 600-second encoder timeout remain. Single-process deployment is required; multiple workers need shared job coordination before adoption.
