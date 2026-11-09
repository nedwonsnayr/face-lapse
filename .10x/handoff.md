# Current handoff — manual-face-selection

Merged through PR #18 and deployed at `55a137a`. Live health, migration, record preservation, authentication boundary, frontend bundle and real detector/selection smoke checks passed. Details: `reviews/2026-11-09-face-selection-deployment.md`. Spec: `specs/2026-11-09-manual-face-selection-design.md`; architecture: ADR-004. QA and security reports are under `reviews/2026-11-09-face-selection-*`.

Usage: upload/align; multiple detected faces wait in Choose your face. Select a numbered outline, then Align this face. Saved geometry is reused on re-align. Library eye action is Change face. Each new group photo asks for a choice; no automatic identity matching. Queue survives reload and completed processing survives a disconnected stream. Individual queue removal requires confirmation.

Migration 007 is additive and idempotent; runs on startup. Existing images are preserved until explicitly changed. Runtime requirements unchanged; `make install` now installs test-only httpx too. `make test-backend`, `make test-e2e`, and frontend `npm run build` are the checks. For a later hosted rollout, use the existing hosting runbook and backup first; rollback application code can ignore the added columns. No live rollout or backup check was performed here.

## Previous handoff history

# Current handoff — app analysis (2026-11-09)

Review complete. See `reviews/2026-11-09-app-analysis.md` and `decisions/{senior-engineer,qa,security}/app-analysis.md`. First proposed remediation: correct thumbnail cache identity and recover pending uploads; next isolate/bound exports and verify timing. No application changes were made. Obtain design approval before implementation under the 10x skill. This analysis does not establish current production health.

## Handoff history (preserved)

# Handoff → owner
Live: https://facelapse.ryanmsnowden.com (server 193.122.143.130, user `ubuntu`, key `~/.ssh/id_ed25519` on the main laptop). Runbook: `docs/hosting.md`.
Next: the owner checks the site; then push/PR the branches and add the GH deploy secrets.

## manual-face-selection — Brainstorming
Approved one-timelapse manual-selection workflow recorded. Spec self-review: no placeholders; automatic identity matching excluded.

## manual-face-selection — Strategy
Scope accepted: manual selection per photo, one timeline, persistent review queue.

## manual-face-selection — Design
ADR-004 and component/schema decisions written. Proceed with the user-approved workflow.

## manual-face-selection — Planning
Implementation tasks ready. Work in isolated checkout with throwaway data; source repository receives reviewed committed changes after verification.

## manual-face-selection — Implementation Complete
Backend, schema, picker/review queue, cache versioning, fixture and regression suites implemented. Verify full suite, actual two-face discovery, saved choice/re-alignment, export/deletion protection, rotated-original geometry, migration and phone dialog.

## Hosted deployment authorized
Fresh same-server DB snapshot verified (1,041 rows). GitHub PR/checks → merge → automatic deploy → revision/schema/health/auth smoke checks. Prior revision: 921b0a2. No fresh off-site backup; automatic approval review rejected egress/pruning.

CI fix: use Ubuntu 24.04 for pinned Playwright. First run failed at browser install; no tests or deployment ran. Wait for corrected checks before merge.

## Face-detection diagnostic
Supplied full-body couple photo is missed at full-frame scale; same detector finds both faces in a tighter crop. See decisions/qa/face-detection-distance.md. Potential crop/tile fallback remains a proposed follow-up, not implemented. User asked for an explanation only.

## crop-search-fallback — Brainstorming
User-approved fallback behavior documented; spec reviewed for scope and ambiguity. No identity matching or original-image edits.
