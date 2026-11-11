# DevOps: settings-dark-mode
- **Ship:** merging the PR to main triggers the existing GitHub Actions deploy to the Oracle VM. There's no migration, environment variable or Docker change.
- **Rollback:** revert the merge commit. Saved settings stay in browsers but are harmless, because the old build ignores `face-lapse:settings`. Grid/list falls back to the legacy key, which is no longer written. Anyone who toggled after the deploy loses that one preference.
