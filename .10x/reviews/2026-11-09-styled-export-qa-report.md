# Styled video export — QA (2026-11-09)

- Backend suite: **21/21 passed** (3.735 s). Includes four-mode image composition, clear source-photo corners, paper/mat colors, independent API flags, birthday validation, age zero, unavailable captions, metadata/source immutability, unique result paths and failed-render cleanup. Actual FFmpeg output decoded and inspected; 3 frames at 0.05s produce exactly 0.15s at 1200x1800.
- Chromium suite: **47/47 passed** (41.6 s), including all crop-search tests. Four new export cases each click real UI toggles, check independent preview spans, download an actual MP4, decode the caption region with FFmpeg and verify the presence/absence of date ink and age red. Fifth browser case verifies the birthday picker preserves its selected calendar day in Pacific/Auckland; preview example August 19, 2020 shows Age 24 in America/New_York.
- Production TypeScript/Vite build and diff whitespace checks: passed.
- Visually inspected a rendered PNG, decoded MP4 frame and age-only browser screenshot. Supplied reference styling is reproduced with off-white paper, dark mat/shadow, Fraunces italic date and tracked red uppercase age below the photo. No playback controls burned into MP4. Dimensions stable in all modes.
- Public repository fixtures used for encoded/media/browser artifacts. No private screenshot/photo was added to git or uploaded.

No production deployment performed. Existing video job remains in-process and has its existing concurrency model; this change gives each export its own filename. All modes now render styled frames, so no-caption export also uses preprocessing. Font assets/notice files are bundled for Linux as well as local rendering; no font conversion runtime is needed.
