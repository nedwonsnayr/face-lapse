# Security — index
- [DISCOVERED] Local single-user app with no auth; the backend listens on localhost.
Active features: [ui-revamp](ui-revamp.md)
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)
- app-analysis: [2026-11-09 review](app-analysis.md) — analysis complete; remediation pending design.

- manual-face-selection: verified for local delivery; see [manual-face-selection](manual-face-selection.md).

- crop-search-fallback: verified locally; [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: verified; see [styled-video-export](styled-video-export.md).

- export-performance: No new blocking finding. Reviewed bounded admission, safe private cache keys, invalidation, background copying, existing auth and path containment. Single-user/single-process scope; see security review.

- person-profiles: see [person-profiles](person-profiles.md).

- archive-experience: approved eight-part upgrade; ADR-009.
