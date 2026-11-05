# SDE — image-sizes (2026-11-05)

**Trigger:** the timelapse and library loaded slowly on the owner's phone. Every library tile fetched the full 1200×1600 aligned JPEG (~410 KB), the player swapped full-size frames at up to 20 fps, and nothing was preloaded.

## Built
- `services/resize.py`: `?size=thumb` (≤300×400, q75, ~12 KB) and `?size=frame` (≤600×800, q80, ~43 KB) on `/aligned` and `/original`.
  - Copies are made on first request, cached in `data/thumbs/` as `{id}-{content_hash}-{size}.jpg`, and written atomically (temp file + rename).
  - Purged on delete, Dismiss All and re-align. Excluded from restic backups.
- Frontend: library tiles, the no-face group and the staging tray use `thumb`; the player uses `frame` and preloads the next 8 frames. Video export still uses the full-size files on the server.
- Measured on real library images: tiles 33× smaller, frames ~10× smaller. Generation takes 10–20 ms per image (laptop), and cached copies serve in under 1 ms.

## Tests
New e2e test in `library-sync.spec.ts`; 33/33 pass.
