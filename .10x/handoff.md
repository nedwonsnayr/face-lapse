# Current handoff — crop-search-fallback

Implemented and verified: baseline full/downscaled detector first, then at most nine overlapping half-frame crops, max 1024px per crop, remapped to original normalized eyes/bounds and deduplicated. Existing selection flow unchanged. The supplied personal HEIC works locally; no personal photo pushed or placed in repository. Public padded fixture plus full regression tests pass (backend 15, browser 42, build).

No hosted deployment yet. After installation, retry a failed library photo using Re-run face alignment; multiple recovered faces then appear in Choose your face. No automatic library rewriting, migration or new dependencies. See ADR-005, specs/2026-11-09-crop-search-fallback-design.md and reviews/2026-11-09-crop-search-*.

## Previous handoff history

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

## crop-search-fallback — Strategy
Scope is a targeted detection fallback after a zero-face result; existing successful detections remain on the fast path.

## crop-search-fallback — Design
ADR-005 written. Crop input bound and coordinate contract defined before implementation.

## crop-search-fallback — Planning
Ready to implement bounded search. Source repository and real library data remain untouched during tests.

## crop-search-fallback — Implementation Complete
Bounded crop search and original-coordinate mapping added. Public padded regression fixture; supplied HEIC yields two faces locally. Verify all suites and render original alignment outputs. No private image committed; no deployment performed.
