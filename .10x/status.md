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
