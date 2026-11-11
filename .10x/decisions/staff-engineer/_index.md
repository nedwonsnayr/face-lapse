# Staff Engineer — index
- [DISCOVERED] Convention (being retired): per-component `*.styles.ts` exporting `Record<string, React.CSSProperties>`.
- [DISCOVERED] Tests select almost exclusively by `data-testid`; these attributes are the public contract of the UI.

Active features: [ui-revamp](ui-revamp.md)
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: [manual-face-selection](manual-face-selection.md) — one timelapse, manual face choice.

- crop-search-fallback: bounded crop fallback; see [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: screenshot-matched export with independent captions.

- export-performance: Keep API polling contract, add optional phase/completed/total fields. Snapshot job responses under lock. Preserve existing outputs and download links. No deletion of old user exports.

- archive-experience: approved eight-part upgrade; ADR-009.

- photo-date-fallback: approved explicit date provenance and correction; ADR-010.

- settings-dark-mode: tokens only, no literal colors outside on-photo chrome; see [settings-dark-mode](settings-dark-mode.md).

- timelapse-filters: ADR-012; see [timelapse-filters](timelapse-filters.md).
