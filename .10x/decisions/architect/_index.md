# Architect — index
- [DISCOVERED] Frontend: `App.tsx` owns the image list and passes it to `Upload`, `ImageLibrary` and `Timelapse`, each wrapped in `ErrorBoundary`. `api.ts` is the only backend boundary (REST + streaming progress).
- [DISCOVERED] Backend: FastAPI routers under `backend/app/routers`; data in `data/` (originals, aligned, videos) plus SQLite.

Active features: [ui-revamp](ui-revamp.md) — ADR-001, ADR-002
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.

- crop-search-fallback: bounded crop fallback; see [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: screenshot-matched export with independent captions.

- export-performance: ADR-007: cache static canvas/fonts; reuse completed or running job by ordered inputs, source revision/stat and visible caption values, duration and renderer version. Single active export; different concurrent requests get retryable 409. Cache limited to existing 20 job records, process lifetime only. No persistent cache or DB migration.

- person-profiles: see [person-profiles](person-profiles.md).

- archive-experience: approved eight-part upgrade; ADR-009.

- photo-date-fallback: approved explicit date provenance and correction; ADR-010.

- settings-dark-mode: ADR-011; SettingsProvider + light-dark() tokens. See [settings-dark-mode](settings-dark-mode.md).
