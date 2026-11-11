# Senior Engineer — index
Active features: [ui-revamp](ui-revamp.md)
- app-analysis: [2026-11-09 review](app-analysis.md) — analysis complete; remediation pending design.

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.

- crop-search-fallback: bounded crop fallback; see [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: screenshot-matched export with independent captions.

- export-performance: Verify pixel equality with old renderer. Hash normalized ordered metadata plus path stat/revision; validate input signature again after encoding to avoid reusing results from concurrently changed sources. Failed/missing outputs never reused. Keep existing FFmpeg preset and JPEG settings.

- archive-experience: approved eight-part upgrade; ADR-009.

- photo-date-fallback: approved explicit date provenance and correction; ADR-010.

- settings-dark-mode: approach per task; see [settings-dark-mode](settings-dark-mode.md).

- timelapse-filters: ADR-012; see [timelapse-filters](timelapse-filters.md).
- timelapse-prefetch: see [timelapse-prefetch](timelapse-prefetch.md).
