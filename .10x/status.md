# Status
**Feature:** cloud-hosting (branch `cloud-hosting`, cut from `ui-revamp`; not pushed)
**Phase:** cloud-hosting delivered; library-sync in PR

| # | Task | State |
|---|---|---|
| 1 | State, spec, ADR-003 | done |
| 2 | Migration 004: portable image paths | done |
| 3 | Serve SPA, CORS, Linux fonts | done |
| 4 | Cloudflare Access JWT middleware | done |
| 5 | Byte-capped uploads + background video job | done |
| 6 | Dockerfile + compose | done |
| 7 | Server/backup/deploy scripts, runbook, GH deploy workflow | done |
| 8 | Account setup (owner) | done |
| 9 | Provision VM, migrate data, go live | done |
| 10 | Verification + QA/security reviews | done (owner's browser check pending) |

Open:
- The owner verifies browse, upload and download through the site.
- Push/merge `ui-revamp` + `cloud-hosting` to main, then set up the GH deploy secrets (docs/hosting.md §3).
- Optional: reserve a static public IP in Oracle (ephemeral IPs change on stop/start).

## library-sync (2026-11-05)
Auto-refresh, new photos shown in both groups, staged uploads hidden and safe from Dismiss All, content-hash image URLs. e2e 32/32. In a PR.
