# SDE: timelapse-filters (built)
## What was built
- **Shared definition:**
  - `frontend/src/filters/definition.ts`: types, IDENTITY, RANGES, validateFilter and sameFilter.
  - `builtins.json` / `builtins.ts`: 10 looks, sparse JSON that is also read by `scripts/filter_reference.py`.
- **Export engine:** `backend/app/services/filters.py`:
  - Pydantic `FilterDefinition`, `canonical_filter`.
  - numpy `apply_filter_array` runs channel-planar (3×H×W). It skips identity steps, which are exact no-ops.
  - The vignette mask and grain cell index are lru-cached per size.
  - Grain hashes per cell, then expands.
  - Called from `render_video_frame(..., photo_filter, frame_index)`.
- **Playback:**
  - `FilterRenderer.ts` (WebGL2, `texelFetch`, no color conversion on upload, uint lowbias32 grain) and `FilterCanvas.tsx`.
  - `BufferedFrame` overlays `<canvas data-testid="timelapse-filtered-frame">` on the kept `<img>` (same grid cell). It falls back to the `<img>` plus a note when WebGL2 is unavailable or the context is lost.
- **Storage:** `models.FilterPreset`, `migrations/011_add_filter_presets.py`, `routers/filters.py`:
  - GET, POST, PUT and DELETE.
  - Names are unique ignoring case, with an IntegrityError → 409 race guard.
  - Capped at 50 presets.
- **Export:**
  - Optional JSON body `{"filter"}` on `POST /api/video/generate` (`GenerateBody`, `extra=forbid`).
  - The cache key is `styled-export-v2` and includes the canonical filter.
  - The client sends `null` for Original.
- **Saved export presets** keep a validated copy of the filter. Older presets load as Original.
- **UI:**
  - `FilterPicker`: chip strip with live thumbnails from one shared offscreen renderer, refreshed on pause.
  - `FilterEditor`: inline panel with sections, per-control reset, Reset all, Save/Cancel, and Delete with a confirmation dialog.
  - The player is pinned (sticky) while the editor is open.
- **Tests:**
  - `test_filters.py` (10), `test_filter_presets.py` (7), and additions to `test_video_export` and `test_video_jobs`.
  - Playwright: `filter-parity.spec.ts` (33 cases, max diff 1/255; grain is bit-identical) and `filters.spec.ts` (4).
  - The Playwright config enables SwiftShader WebGL for headless and CI runs.
## Deviations from the plan
- **Export cost:** a full preset measured about 100–150 ms per frame on an M-series Mac, against the 50–100 ms estimate. This was after the planar layout and caching work, up from about 200 ms at first. It could be slower on the ARM VM, and QA should measure it.
- **"New filter"** starts from Original. "Duplicate" starts from the selected look and is named "<name> copy".
- **The picker is disabled while the editor is open**, so a chip click can't silently replace the draft.
- **The parity test skips itself** under `playwright.docker.config.ts`, because it imports `/src` from the Vite dev server.
## Tech debt
- **Two implementations of the pipeline.** They're guarded by the normative spec and the parity test; any change needs both.
- **Filtered export runs frames sequentially.** numpy releases the GIL, so a small thread pool could roughly halve filtered export time if that's ever needed.
