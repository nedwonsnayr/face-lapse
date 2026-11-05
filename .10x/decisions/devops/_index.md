# DevOps — index
- [DISCOVERED] CI: `.github/workflows/e2e-tests.yml` runs Playwright on push and PR. The app runs locally via `make start` or `Face Lapse.command`; nothing is deployed.
- ui-revamp: no pipeline changes. Run `npm install` in `frontend/` for the new font packages (`make install` does this). Rollback: revert commit 25c6d10.
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)
