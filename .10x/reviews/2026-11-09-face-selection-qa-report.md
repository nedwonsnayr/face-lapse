# Manual face selection — QA report (2026-11-09)

Scope: one timeline, manual choice per photo, existing MediaPipe detector. Changes tested in `/private/tmp/face-lapse-face-selection` with disposable data, not the owner's photos/database.

- Production TypeScript + Vite build: passed.
- Backend unittest suite: **9/9 passed**, including real multi-face detection, exact saved-eye geometry on realign, changing selection and URL version, invalid/missing selection rejection, export and bulk-dismiss protection, EXIF-oriented renditions/cache isolation, legacy image discovery without altering alignment, interrupted-stream persistence, and additive migration idempotency/preservation.
- Full Chromium Playwright suite: **41/41 passed in 28.9 s**, including the previous 38 tests. New UI coverage: queued photo survives reload, choose/save/change, keyboard choice, exact selection retained on reopen, cancel/Escape without changing output, explicit queue removal, phone size, failed-save message and retry.
- Visually inspected desktop (1280 px) and phone (390 px) screenshots: outlines match both detected faces, modal controls fit, selected state/error are readable.
- `git diff --check`: passed.

The runtime still detects faces best-effort, up to ten. No face identity matching is performed. Legacy images keep existing output until explicitly changed/re-aligned. Production Docker/arm64 image and live Cloudflare flow were not run in this task. Existing hosting requirements and detector dependency remain unchanged. No production deployment performed.
