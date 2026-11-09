# Crop-search fallback — QA report (2026-11-09)

- Backend suite: **15/15 passed** (2.024 s), including six new regressions for distant-face detection/deduplication, original-coordinate accuracy, off-center faces, close-up fast path, bounded search count/resolution, tiny images, and picker/select/re-align preservation.
- Chromium browser suite: **42/42 passed** (30.1 s). New distant-face upload reaches exactly two choices, saves the selection and plays in the timelapse.
- Production TypeScript/Vite build: passed. `git diff --check`: passed.
- Supplied HEIC (local only): exact old full-frame pipeline found zero; new pipeline finds both foreground faces in about 0.5 s. Both stored candidates successfully align the original. Temporary render checks visually inspected for each candidate; eyes/face centered correctly.
- Public regression fixture uses only existing repository test photos on a padded canvas, not the supplied personal photo. Whole-frame Face Mesh finds zero on it; fallback finds two. Remapped eyes differ from the unpadded reference by 0.6–1.8 px (test tolerance 16 px for detector variation).

Search is best-effort: at most nine extra half-frame crops when baseline detection fails, each at most 1024 px, ten unique candidates maximum. Existing successful baseline detections return immediately. Existing saved choices are not re-detected. No schema, API, frontend layout, dependency, original-photo or hosted-library changes. No deployment performed during this task.
