# DevOps: timelapse-prefetch
- **Deploy:** ships with the existing deploy-on-merge-to-main workflow (`deploy.yml`). It's frontend only, with no migrations and no config changes.
- **Rollback:** revert the PR. There's no data impact.
