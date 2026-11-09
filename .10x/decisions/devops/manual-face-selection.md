# manual-face-selection — devops

Keep existing CI and hosting. Add backend unittest execution and production frontend build to existing E2E workflow, with test-only httpx dependency and cache key update. make test-backend uses disposable data; production Docker requirements unchanged. Alternative manual-only test execution rejected because selection/deletion behavior needs ongoing regression checks. No production rollout requested; additive migration runs on startup when this change is later deployed.
