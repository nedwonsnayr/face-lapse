# QA — index
Active features: [ui-revamp](ui-revamp.md)
- cloud-hosting: see [cloud-hosting](cloud-hosting.md)
- app-analysis: [2026-11-09 review](app-analysis.md) — analysis complete; remediation pending design.

- manual-face-selection: verified for local delivery; see [manual-face-selection](manual-face-selection.md).

- face-detection-distance: supplied-photo failure reproduced; tighter crop detects both foreground faces. Diagnosis only.

- crop-search-fallback: verified locally; [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: verified; see [styled-video-export](styled-video-export.md).

- export-performance: 29 backend, 49 browser checks and production build passed. ARM benchmark 16.320s to 8.705s (60 public frames), four modes pixel-identical. See export-performance QA report; full-library post-change time not measured.

- person-profiles: see [person-profiles](person-profiles.md).

- image-loading-recovery: release read connections between worker stages; concurrent-request regression.

- archive-experience: verified for PR delivery; see archive-experience.md.

- photo-date-fallback: verification complete; see feature review.

- settings-dark-mode: 69/69 e2e incl. 5 new; contrast script; visual pass. See [settings-dark-mode](settings-dark-mode.md).

- timelapse-filters: 74/74 e2e, parity at most 1/255; see [timelapse-filters](timelapse-filters.md).
- timelapse-prefetch: see [timelapse-prefetch](timelapse-prefetch.md).
- playback-cadence: see [playback-cadence](playback-cadence.md).
