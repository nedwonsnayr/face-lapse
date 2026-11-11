# CTO — index
- [DISCOVERED] Stack: React 18 + Vite 6 + TypeScript frontend; FastAPI + SQLite backend (`backend/app`); FFmpeg for video; Playwright e2e in CI (`.github/workflows/e2e-tests.yml`).
- Local-first, single-user app (launched via `Face Lapse.command` / `make start`).

Active features: [ui-revamp](ui-revamp.md)
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.

- crop-search-fallback: bounded crop fallback; see [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: screenshot-matched export with independent captions.

- export-performance: Optimize existing Pillow/FFmpeg pipeline; avoid new infrastructure or quality changes.

- archive-experience: approved eight-part upgrade; ADR-009.

- photo-date-fallback: approved explicit date provenance and correction; ADR-010.

- settings-dark-mode: build; device-local, frontend-only. See [settings-dark-mode](settings-dark-mode.md).

- timelapse-filters: ADR-012; see [timelapse-filters](timelapse-filters.md).
