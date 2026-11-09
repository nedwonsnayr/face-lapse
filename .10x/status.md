# Image loading recovery — 2026-11-09

Production revision 3043fcb reports SQLAlchemy QueuePool timeouts in get_profile_id.
Person validation checked out a connection in a sync dependency and retained it
until the endpoint/response completed. Concurrent photo requests could fill the
worker pool with connection waiters, starving endpoints holding those connections.

Fix: close the validation read session before returning its scalar profile ID;
the shared Session remains reusable by the endpoint. Detach image metadata and
close the image read session before resize/file streaming. No pool-size increase,
permissions change, schema migration or file changes.

Regression: 80 concurrent requests against a two-connection pool. Original code
failed with HTTP 500; fixed code returns all 200. Final test mixes original/full,
original/thumb, aligned/thumb and aligned/frame requests. Backend 37 passed.
Production read-only file check: 1,045 records, zero missing originals or referenced
aligned files. All 53 Chromium tests passed (53.0s), including playback, library and person isolation. Fix ready for review; not deployed yet.

## Previous history

# Person profiles — PR #22, ready for review

PR: https://github.com/nedwonsnayr/face-lapse/pull/22. Local verification complete; GitHub CI pending. No merge/deployment. Final person/keyboard checks 4/4 passed; temporary test servers stopped.

Person tabs, add/edit name and birthday, isolated libraries/capture/face queues/order/exports, safe async switching and pending recovery implemented. Migration 008 retains existing photos under Ryan. Backend 36 passed; Chromium 53 passed; affected upload/person suites 6 passed; build/diff clean. QA/security reports: reviews/2026-11-09-person-profiles-*.md. No deployment or real-library writes.

# Person profiles — implementation

Approved spec and ADR-008 recorded. Implement scoped backend then keyed frontend workspace and verify with disposable data. No deployment yet.

# Export performance — implemented and locally verified

PR: https://github.com/nedwonsnayr/face-lapse/pull/21 (draft).
Local verification: 29 backend tests, 49 Chromium tests, production build and whitespace checks passed. Actual ARM host public-fixture benchmark: 16.320s baseline to 8.705s optimized (60 frames, 46.7% less time); four caption modes pixel-identical. Personal library and hosted application were not changed.

GitHub run 42683956228 remains in Install FFmpeg dependency setup; it has not reached regression tests as of the handoff. CI success must not be claimed. No merge or deployment performed. Review/merge and hosted rollout remain pending. Implementation and operational design are in ADR-007, export-performance role notes and reviews/2026-11-09-export-performance-*.md. Keep one application process; reuse is bounded and process-local.

# Export performance — verified, preparing pull request

29 backend / 49 browser tests and build passed. ARM public-fixture full export 46.7% faster with pixel-identical frames. Static artwork/font reuse, bounded matching-job reuse, single-job admission, progress and phase timing. No deployment yet. Reports: reviews/2026-11-09-export-performance-*.md. ADR-007.

# Export performance — implementation complete; verification in progress

45 public-fixture frames: baseline 2.852s, optimized 1.523s; render 1.856s to 0.582s; all four modes pixel-identical. Test invalidation/admission/failure/progress and full regressions.

# Export performance — design and planning complete

ADR-007 and spec recorded before implementation. User authorized applying discussed improvements. Benchmark and implement renderer reuse, bounded job reuse and progress, then verify.

# Current status — styled-video-export
Date: 2026-11-09
Phase: Verification Complete; ready for review. Hosted app not updated.

Screenshot-matched paper/mat/captions rendered into 1200x1800 MP4. Independent date/age in preview and export; calendar birthday handling; bundled licensed matching fonts; unique outputs and exact rational playback cadence. Local checks: backend 21/21, Chromium 47/47 (41.6s), build/diff passed. Decoded media verified for all four combinations. Crop-search PR #19 was merged while this feature was developed; styled export is on its own follow-up branch. ADR-006 and reviews/2026-11-09-styled-export-*.

## Previous status history

# Current status — crop-search-fallback
Date: 2026-11-09
Phase: Verification Complete; ready for local delivery/review. No hosted deployment performed.

Bounded overlapping crop search after full-frame miss; duplicate suppression and original-coordinate geometry verified. Supplied HEIC now finds both foreground faces and aligns either. Tests: backend 15/15, Chromium 42/42 (30.1 s), production build and diff checks passed. Private photo remains local and excluded from git. Reports: reviews/2026-11-09-crop-search-{qa-report,security-review}.md. ADR-005. No migration or dependency changes.

## Previous status history

# Current status — manual-face-selection
Date: 2026-11-09
Phase: Hosted Delivery Complete. PR #18 merged and deployed at `55a137a`; live checks passed.

- Approved: one timelapse centered on owner, manual face choice for group photos.
- Done: ADR-004/spec/plan, detector and additive migration 007, saved selection API, reload-safe queue/picker, Change face, fresh rendition cache, regressions and CI integration.
- Validation: backend 9/9, Chromium 41/41 (28.9s), production frontend build and diff checks passed.
- Reports: `reviews/2026-11-09-face-selection-qa-report.md` and `reviews/2026-11-09-face-selection-security-review.md`.
- Delivery: reviewed commits delivered to `codex/manual-face-selection` in the original repository; working tree clean. No production data touched during verification.

- Hosted verification: SQLite integrity ok, 1,041 records retained, migration 007 applied, app healthy, auth enforced, both fixture faces align on production ARM. See `reviews/2026-11-09-face-selection-deployment.md`.

## Previous status history

# Status
**Feature:** cloud-hosting (branch `cloud-hosting`, cut from `ui-revamp`; not pushed)
**Phase:** cloud-hosting delivered; library-sync in PR

| # | Task | State |
|---|---|---|
| 1 | State, spec, ADR-003 | done |
| 2 | Migration 004: portable image paths | done |
| 3 | Serve SPA, CORS, Linux fonts | done |
| 4 | Cloudflare Access JWT middleware | done |
| 5 | Byte-capped uploads + background video job | done |
| 6 | Dockerfile + compose | done |
| 7 | Server/backup/deploy scripts, runbook, GH deploy workflow | done |
| 8 | Account setup (owner) | done |
| 9 | Provision VM, migrate data, go live | done |
| 10 | Verification + QA/security reviews | done (owner's browser check pending) |

Open:
- The owner verifies browse, upload and download through the site.
- Push/merge `ui-revamp` + `cloud-hosting` to main, then set up the GH deploy secrets (docs/hosting.md §3).
- Optional: reserve a static public IP in Oracle (ephemeral IPs change on stop/start).

## library-sync (2026-11-05)
Auto-refresh, new photos shown in both groups, staged uploads hidden and safe from Dismiss All, content-hash image URLs. e2e 32/32. In a PR.

## app-analysis (2026-11-09)
Phase: Analysis Complete. Reviewed commit `1498415`; application code unchanged. Build passed; Chromium E2E 38/38 passed. Findings and evidence: `reviews/2026-11-09-app-analysis.md`. Remediation remains unapproved; historical cloud deployment/backup state was not reverified.

## manual-face-selection: Brainstorming
Approved one-timelapse manual-selection workflow recorded. Spec self-review: no placeholders; automatic identity matching excluded.

## manual-face-selection: Strategy
Scope accepted: manual selection per photo, one timeline, persistent review queue.

## manual-face-selection: Design
ADR-004 and component/schema decisions written. Proceed with the user-approved workflow.

## manual-face-selection: Planning
Implementation tasks ready. Work in isolated checkout with throwaway data; source repository receives reviewed committed changes after verification.

## manual-face-selection — Implementation Complete
Backend, schema, picker/review queue, cache versioning, fixture and regression suites implemented. Verify full suite, actual two-face discovery, saved choice/re-alignment, export/deletion protection, rotated-original geometry, migration and phone dialog.

Hosted check 42660131648 blocked on Playwright/Ubuntu 26.04 incompatibility before tests. Pinned test runner to Ubuntu 24.04; rerun pending.

## face-detection-distance (2026-11-09)
Diagnosis complete: HEIC decoding succeeds; full-frame pipeline finds zero, tighter foreground crop finds two. No app changes. See decisions/qa/face-detection-distance.md.

## crop-search-fallback — Brainstorming
User-approved fallback behavior documented; spec reviewed for scope and ambiguity. No identity matching or original-image edits.

## crop-search-fallback — Strategy
Scope is a targeted detection fallback after a zero-face result; existing successful detections remain on the fast path.

## crop-search-fallback — Design
ADR-005 written. Crop input bound and coordinate contract defined before implementation.

## crop-search-fallback — Planning
Ready to implement bounded search. Source repository and real library data remain untouched during tests.

## crop-search-fallback — Implementation Complete
Bounded crop search and original-coordinate mapping added. Public padded regression fixture; supplied HEIC yields two faces locally. Verify all suites and render original alignment outputs. No private image committed; no deployment performed.

## styled-video-export — Brainstorming
User-provided screenshot is the accepted visual design; four independent visibility combinations explicit. Spec self-reviewed before implementation.

## styled-video-export — Strategy
Selected server-side deterministic frame composition with existing libraries; no database or hosting change.

## styled-video-export — Design
ADR-006 written; dimensions, flags, validation and media contract fixed before code changes.

## styled-video-export — Planning
Ready for implementation. Pending crop-search change stays included in this draft branch.

## styled-video-export — Implementation Complete
Styled renderer/fonts, independent flags/calendar handling, unique outputs/rational cadence and regression cases implemented. Verify decoded MP4 appearance for all four modes, exact frame count/duration, birthday validation/timezone behavior and full regression suites.

## Styled export performance diagnostic (2026-11-09)
Live export completed in 265.2s for 1,043 frames / 52.15s playback; observed ~4 CPU cores busy. UI waits for full generation before transfer. See decisions/sre/styled-export-performance.md. No app/production changes made; phase profiling and optimization remain proposed follow-up.
