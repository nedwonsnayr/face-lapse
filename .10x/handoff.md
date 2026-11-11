# Handoff: playback-cadence → DevOps

Frontend only; ships through merge to main; revert to roll back. Live check: playback at 0.05 s should be close to 20 fps. Measure from a browser whose timers are accurate (see the SRE caveat in decisions/sre/timelapse-prefetch.md).

## Previous history

# Handoff: timelapse-prefetch → DevOps + SRE

Frontend only; ships through merge to main; revert to roll back. To check it's healthy, see decisions/sre/timelapse-prefetch.md. Follow-up worth considering: deadline-based cadence, because 0.05 s plays at about 60 ms per frame (pre-existing).

## Previous history

# Handoff: timelapse-prefetch → SDE

Implement per decisions/senior-engineer/timelapse-prefetch.md and ADR-013. Measurement baseline is in ADR-013's Context. The user authorized an admin merge and deploy once it's verified.

## Previous history

# Handoff: timelapse-filters → DevOps + SRE

Ships through merge to main. Migration 011 (new table only) runs at startup. Rollback is to revert the PR; the table is harmless. Reviews are in reviews/2026-11-10-timelapse-filters-{qa-report,security-review}.md. Watch export phase timings and video disk use after deploy.

## Previous history

# Handoff: timelapse-filters → QA + Security

What was built is in decisions/sde/timelapse-filters.md. To test:
- the full Playwright suite (with the SwiftShader flags now in the config)
- light and dark themes, at desktop and 390 px, with the editor open (sticky player)
- filtered export timing and size versus unfiltered

To review:
- `/api/filters` input limits and the export body (`extra=forbid`)
- preset names render as text only
- the 50-preset cap

## Previous history

# Handoff: timelapse-filters → SDE

Read ADR-012 and the spec. The pipeline formulas there are normative. Tasks are in decisions/engineering-manager/timelapse-filters.md, and the approach is in senior-engineer/timelapse-filters.md. Migration 011 adds `filter_presets`.

## Previous history

# Handoff: settings-dark-mode → DevOps

Frontend-only. The usual merge-to-main deploy ships it, with no migration or environment change. Rollback is to revert the PR. Reviews are in reviews/2026-11-10-settings-dark-mode-*.md.

## Previous history

# Handoff: settings-dark-mode → SDE

Read ADR-011 and decisions/{architect,senior-engineer}/settings-dark-mode.md. Tasks are in engineering-manager/settings-dark-mode.md. Once the PR is up, update the design system artifact (https://claude.ai/artifact/CVNuQWqJm81qjR2f25mMXh) with dark theme values.

## Previous history

# Photo date correction — PR25 ready for review

PR: https://github.com/nedwonsnayr/face-lapse/pull/25. Preventive changes await merge and the existing main deployment. Locally: 50 backend / 63 browser tests, frontend build, migration retention and mobile editor review passed; the 2 new browser tests also passed after making screenshot artifacts portable to Linux CI. No background watcher or test servers remain. GitHub checks not yet confirmed complete at this handoff.

Live correction complete: known upload-time fallback is now November 9 rather than the inferred November 13; actual capture date unknown. Guarded private audit saved before the one-row change; original bytes unchanged. Prior records will retain legacy provenance on migration until explicitly edited. QA/security and operational notes are in decisions/*/photo-date-fallback.md and reviews/2026-11-09-photo-date-*.md.

## Previous history

# Photo date correction — verified, preparing PR

50 backend / 63 browser tests and production build passed. QA/security reviews recorded. Live invalid date repaired to known upload time with guarded audit; original unchanged. Preventive application changes await PR merge/main deployment. Old dates retained with legacy provenance.

## Previous history

# Photo date correction — implementation complete

Uploads no longer call interpolation. EXIF/filename/upload provenance is persisted by additive migration010; prior rows remain legacy. Browser timezone is validated before writes; full UTC camera filenames resolve to local calendar time. Scoped active-photo date editing supports manual and explicit upload fallback. Grid/list date buttons open a modal; staging and library label upload dates. Paused preview looks up current metadata by ID with a memoized map, preserving decoded bytes.

Initial verification: 50 backend tests and 2 new browser tests pass; mobile dialog visually inspected. Regression coverage includes archive gaps, UTC midnight/DST, EXIF priority, camera dates, malformed input, wrong person/trashed records, ETag changes, migration retention, file preservation, edit/reset/reload and failed-save retry. Full browser regression and final build remain. No production writes yet.

## Previous history

# Photo date correction — design and planning complete

User deferred to team recommendation. Spec and ADR-010 recorded; proceed with scoped implementation and regression tests. PR24 merged and deployed at d80a19f. No production writes yet.

## Previous history

# Archive experience — PR24 ready for review

PR: https://github.com/nedwonsnayr/face-lapse/pull/24 (open, mergeable). GitHub CI running as of publication; no success claim yet. All eight approved areas implemented, 44 backend and 61 browser tests passed locally, build and migration preservation verified. Test server ports5111/8111 are stopped; no background watcher remains. No merge/deployment or production data writes. Merge uses existing main deployment. Backup status will populate after the updated nightly script records a run; Trash has no expiry; presets per person/device. Runbook and reviews linked below in history.

## Previous history

# Archive experience — verified, preparing PR

All eight approved improvements implemented. 44 backend and 61 browser tests passed; build/syntax/diff clean. Read-only copy migration preserved all 1,035 original rows and fields. QA/security and operational handoffs recorded. Await reviewed PR/main deployment; no production mutations. Backup UI stays unknown until the updated cron records its first run. Presets local; no automatic Trash purge.

## Previous history

# Archive experience — implementation complete

Implemented all eight approved areas on PR23's deployed pool fix. Additive migration009 and explicit active-photo filters; person-scoped trash/restore/permanent deletion, validated move/copy with independent files and cleanup on failure; deterministic date/calendar export selection; atomic backup-status sidecar and on-demand scoped health. UI has bounded decoded frame cache and retries, bounded grid/list/no-face DOM, date navigation, batch transfer/trash/undo, camera guide/timer, comparisons, and local per-person export presets. Existing visual system retained. No production photo mutations or deployment.

Initial verification: 43 backend tests passed; 11 targeted browser tests passed, covering all new workflows plus scaled drag/reorder. Baseline browser run 52/53, with the old mount-everything assertion updated for windowing. Additional backup-status test and final polish require final full regression pass. Production build passes. Desktop/mobile screenshot review prompted caption/buffering and retry-layout refinements. A test-server cleanup experiment interrupted full-suite runs and was reverted; use the existing harness and explicitly verify test ports are stopped at handoff.

Next: final backend/browser/build checks, migration-retention check on a disposable copy, security review, then PR and operational handoff. See ADR009 and docs/hosting.md for rollback/backup caveats. No automatic trash purge; presets stay local; file check is presence only.

## Previous history

# Archive experience — design and plan complete

User approved all prior recommendations. Spec and ADR-009 recorded. Implement scoped backend then bounded frontend media/navigation and archive tools; verify all paths before PR. PR23 is merged and deployed. No live photo mutations.

## Previous history

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

# Person profiles — verification

Backend complete and 36 tests pass. Verify final browser suite, migration retention and scoped export/capture. See ADR-008 and person-profiles spec. Production library untouched; open PR after checks.

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

# Current handoff — styled-video-export

Ready for review on codex/styled-video-export; crop-search PR #19 is already merged. Exports now compose paper, dark mat/shadow, italic date and red tracked age below the photo, with no UI controls. Date/age independently selectable; birthday required only for age. Both flags propagate through api.ts, router, background job and renderer. Static licensed font assets copied by current Dockerfile. Output 1200x1800; aligned sources unchanged. Explicit sequence cadence and UUID filenames keep speed/options correct.

Validation: 21 backend, 47 browser tests, production build; actual MP4 captions tested in all four modes. No deployment yet. See ADR-006, specs/2026-11-09-styled-video-export-design.md and reviews/2026-11-09-styled-export-*. No DB migration required.

## Previous handoff history

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
