# DevOps — index
- [DISCOVERED] CI: `.github/workflows/e2e-tests.yml` runs Playwright on push and PR. The app runs locally via `make start` or `Face Lapse.command`; nothing is deployed.
- ui-revamp: no pipeline changes. Run `npm install` in `frontend/` for the new font packages (`make install` does this). Rollback: revert commit 25c6d10.
- cloud-hosting: see [cloud-hosting](cloud-hosting.md) (ADR-003)

- manual-face-selection: implementation ready for verification.

- manual-face-selection: hosted deployment complete at 55a137a; live verification passed.

- crop-search-fallback: verified locally; [crop-search-fallback](crop-search-fallback.md).

- styled-video-export: verified; see [styled-video-export](styled-video-export.md).

- export-performance: No dependency, schema or infrastructure change. CI runs backend/browser/build. Release via existing PR/main deploy workflow; rollback application revision without data migration. Hosted app not yet updated; CI pending.
