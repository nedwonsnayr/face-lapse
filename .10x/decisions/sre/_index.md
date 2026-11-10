# SRE — index
- Local desktop app with no SLOs or monitoring. ErrorBoundary per section remains the failure containment for ui-revamp.
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: verified for local delivery; see [manual-face-selection](manual-face-selection.md).

- manual-face-selection: hosted deployment complete at 55a137a; live verification passed.

- crop-search-fallback: verified locally; [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: verified; see [styled-video-export](styled-video-export.md).

- styled-export-performance: production export measured at 265.2s for 1,043 frames; generation wait, not initial transfer.

- export-performance: Render/encode timing and cache reuse logs added. One active job; matching requests attach/reuse. Process restart clears reuse and in-flight jobs. Cache limited to 20 retained records; missing MP4 regenerates. Existing export disk retention unchanged. Investigate slow export by phase logs; no invented ETA. ARM public-fixture check confirms 46.7% less full-export time.

- image-loading-recovery: release read connections between worker stages; concurrent-request regression.

- archive-experience: verified for PR delivery; see archive-experience.md.
