# manual-face-selection — devops

Keep existing CI and hosting. Add backend unittest execution and production frontend build to existing E2E workflow, with test-only httpx dependency and cache key update. make test-backend uses disposable data; production Docker requirements unchanged. Alternative manual-only test execution rejected because selection/deletion behavior needs ongoing regression checks. No production rollout requested; additive migration runs on startup when this change is later deployed.

## Hosted deployment (2026-11-09)
Owner explicitly authorized merge and deployment on 2026-11-09. Server healthy at 921b0a228d0612d2da28c164fd0c0428526ed01f. Synced feature with origin/main (merge-only commits; no intervening source changes). Publish PR, wait for GitHub checks, merge, monitor the existing automatic Deploy workflow, then verify revision, migration, row count, bundled picker and auth boundary. Rollback: redeploy 921b0a2; additive columns can remain.
