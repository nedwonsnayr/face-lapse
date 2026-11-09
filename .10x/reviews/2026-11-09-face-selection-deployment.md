# Face-selection hosted deployment — 2026-11-09

PR: https://github.com/nedwonsnayr/face-lapse/pull/18
Merged revision: `55a137aae7cab5bcf0c1bc6114c8a8fdcf063d20`
GitHub validation: https://github.com/nedwonsnayr/face-lapse/actions/runs/42660586195 — successful (backend tests, frontend build, full browser suite).
Deploy: https://github.com/nedwonsnayr/face-lapse/actions/runs/42666132640 — successful.

The first hosted validation failed before tests because ubuntu-latest selected Ubuntu 26.04, unsupported by pinned Playwright. E2E runner pinned to Ubuntu 24.04; corrected validation passed. Existing test workflow re-enabled after GitHub disabled it for inactivity.

The owner explicitly authorized admin merge overriding the single-reviewer requirement. On resuming, PR #18 was already merged and the deployment had already succeeded; no duplicate deployment was initiated. Local main was fast-forwarded to the merged revision.

## Live verification
- Server git revision exactly matches the merged revision above.
- App container healthy; tunnel container running.
- SQLite integrity check: ok. All 1,041 image rows retained; zero IDs missing compared with the pre-deploy snapshot.
- All four face-selection columns present; migration 007 recorded as applied.
- Health endpoint: 200 / status ok. Unauthenticated origin image-library request: 403. Public site: 302 to login.
- Deployed frontend bundle contains the new face picker.
- Public two-face fixture processed inside the actual deployed ARM container using temporary files only: two faces detected; each candidate aligns successfully. No real library records or photos changed by the smoke test.

Snapshot: `/home/ubuntu/face-lapse-pre-deploy/before-face-selection-20261109.db`, private same-server directory/file (700/600), verified before deployment. Fresh off-site backup was not run: automatic approval review rejected the cloud-upload/pruning command. Same-server snapshot was used instead.

Site: https://facelapse.ryanmsnowden.com
Rollback application revision: `921b0a228d0612d2da28c164fd0c0428526ed01f`; additive columns can remain. Existing runbook: `docs/hosting.md`.

This deployment record is committed locally after deployment; it is not pushed to main, avoiding an unnecessary second production rollout for documentation only.
