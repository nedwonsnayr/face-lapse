# Archive experience — delivery readiness, 2026-11-09

Release through the existing reviewed PR -> main GitHub deploy workflow. No new secrets or services. Migration009 is additive; existing images remain active. Backup cron already invokes the checked-out script, so its new stdlib-only reporter activates automatically and writes a non-secret atomic sidecar readable by the container. UI is unknown before first recorded run, overdue after36h, and preserves last successful time when the latest attempt fails.

Runbook: docs/hosting.md, Archive experience rollout. Verify image loading, a fixture trash/restore cycle, preview/export frame counts and next nightly backup. Do not manipulate personal photos for smoke tests. Prefer roll-forward: old code ignores deleted_at and uses hard deletion. Keep current DB and originals/aligned files; do not restore an old DB over later uploads for a code rollback. Presets remain device-local. No automatic trash expiry.

Release readiness verified locally: 44 backend, 61 Chromium, production build, migration preservation. Hosted rollout and GitHub CI remain pending. No merge/deployment performed by this task.
