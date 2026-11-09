# manual-face-selection — sde

Implemented multi-face detection with stored normalized geometry, selection endpoints, reload-safe review queue, accessible native dialog and Change face actions. Single face still auto-aligns; unresolved choices stay out of export and bulk dismiss. Source-specific thumbnail cache and per-alignment version prevent stale previews. Real composite fixture and API/browser regressions are ready for verification. No identity matching, no deployment.

Final verification adjustments: commit each processed image before streaming progress; explicit confirmed queue removal with visible failure state. Tests: backend 9/9, browser 41/41, production build passed.

CI rollout fix: initial hosted validation 42660131648 failed before tests because ubuntu-latest resolves to 26.04, unsupported by pinned Playwright 1.58.2. Pin only the E2E runner to ubuntu-24.04 (supported in installed Playwright registry). No application/runtime changes; existing Deploy runner unchanged. Retry checks before merge.
