# Person profiles — QA

- Full backend suite: 36 passed, real face detection (outside filesystem sandbox for macOS graphics service).
- Full Chromium suite: 53 passed. Subsequent pending-upload refinement: affected person/upload suites 6/6 passed. Final person/keyboard-focus suite: 4/4 passed.
- Production frontend build and git diff whitespace checks passed.
- Browser checks: add/edit person, birthday and last-tab persistence, same source in two libraries, actual separate MP4, original library preserved, recovery of staged photos, delayed old-person response ignored, late camera permission stream stopped. Phone screenshot inspected.
- API checks: all wrong-person image reads/mutations, mixed align/reorder batches, bulk delete, duplicate rules, separate selected faces/files, profile validation, interpolation scope, export input scope, job/file ownership.
- Migration 008 run twice on a copy of local library: 1,035 rows preserved; all pre-existing columns identical; all assigned Ryan; integrity ok; 3.7 ms measured. Synthetic legacy test also runs with foreign keys ON and confirms restoration.
- Existing test drag needed viewport centering after the new toolbar; duplicate-profile test selectors now use ids so prior throwaway test profiles do not make names ambiguous.

No real library or production database was changed. No live deployment yet.
