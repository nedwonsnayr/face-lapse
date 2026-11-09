# manual-face-selection — sde

Implemented multi-face detection with stored normalized geometry, selection endpoints, reload-safe review queue, accessible native dialog and Change face actions. Single face still auto-aligns; unresolved choices stay out of export and bulk dismiss. Source-specific thumbnail cache and per-alignment version prevent stale previews. Real composite fixture and API/browser regressions are ready for verification. No identity matching, no deployment.

Final verification adjustments: commit each processed image before streaming progress; explicit confirmed queue removal with visible failure state. Tests: backend 9/9, browser 41/41, production build passed.
