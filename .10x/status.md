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
