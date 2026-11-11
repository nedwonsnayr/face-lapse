# QA: timelapse-filters
## Strategy
- **Matching (highest risk):** the Playwright parity spec runs 33 cases through WebGL and numpy on the same pixels: every control at its extremes, every blend mode, all built-ins, and grain at frames 0, 3, 1041 and 2³²−1. Observed max diff is 1/255, and grain is bit-identical.
- **Backend units:**
  - Pipeline values, clamping, identity no-op, grain determinism and hash reference.
  - Validation, CRUD, case-insensitive names, the cap, and migration 011 idempotency and retention.
  - The export key includes the filter; a filtered frame changes only the photo rectangle; identity is byte-identical.
- **End-to-end (`filters.spec.ts`):**
  - A chip changes the canvas while playing.
  - Create, duplicate, edit, cancel, delete with confirmation, and reload persistence.
  - Duplicate names are refused and the draft is kept.
  - Export presets keep the filter.
  - The export request carries the filter, the downloaded MP4 is grey for Mono, and Original sends `null`.
  - The no-WebGL2 fallback.
- **Manual (browser pane, isolated data dir):** desktop two-pane, 375 px light and dark, editor pinned preview, a filtered MP4 frame, and file size.
## Bugs found and fixed
- Forcing `--use-angle=swiftshader` broke `canvas.captureStream` in the camera test. CI now uses only `--enable-unsafe-swiftshader`.
- The pinned player was too tall on phones (the existing `min-width: 220px` won), so it's now 170 px while editing.
- The first filters test could time out waiting for the first frame after a cold server start. It now waits up to 15 s.
## Measurements
- **numpy per frame (1024×1384, full Film-like preset, M-series Mac):** about 100–150 ms.
- **MP4 size (3 frames, CRF 23):**
  - none: 215 KB
  - grain 0.45: 776 KB (3.6×)
  - grain max: 1.35 MB (6.3×)
  
  Grain costs more than the 2–3× estimate.
## Known gaps
- Export timing on the ARM VM hasn't been measured. Check the phase logs after deploy.
- The parity spec skips itself against the Docker production image (no Vite `/src`).
