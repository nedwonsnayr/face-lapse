# DevOps: timelapse-filters
- **Deploy:** the existing deploy-on-merge to `main`. No new env vars, dependencies or images change (numpy is already present).
- **Migration 011:** runs at app startup (`CREATE TABLE IF NOT EXISTS filter_presets`). It's additive, takes milliseconds and locks no existing table.
- **CI:** e2e Chromium launches with `--enable-unsafe-swiftshader`, so headless runners get software WebGL2 for the filter specs. Don't add `--use-angle=swiftshader`; it breaks the camera `captureStream` test. The parity spec needs `.venv/bin/python`, which the e2e job already creates.
- **Rollback:** revert the PR and redeploy. The `filter_presets` table stays and older code ignores it. Exports keyed `styled-export-v1` vs `v2` live in memory only, so nothing goes stale.
- **Backups:** the nightly B2 SQLite backup covers the new table automatically.
