# Architect — index
- [DISCOVERED] Frontend: `App.tsx` owns the image list and passes it to `Upload`, `ImageLibrary` and `Timelapse`, each wrapped in `ErrorBoundary`. `api.ts` is the only backend boundary (REST + streaming progress).
- [DISCOVERED] Backend: FastAPI routers under `backend/app/routers`; data in `data/` (originals, aligned, videos) plus SQLite.

Active features: [ui-revamp](ui-revamp.md) — ADR-001, ADR-002
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.
