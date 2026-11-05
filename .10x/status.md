# Status
**Feature:** cloud-hosting (branch `cloud-hosting`, cut from `ui-revamp`)
**Phase:** Implementation complete (code); waiting on the user's account setup (task 8)

| # | Task | State |
|---|---|---|
| 1 | State, spec, ADR-003 | done |
| 2 | Migration 004: portable image paths | done |
| 3 | Serve SPA, CORS, Linux fonts | done |
| 4 | Cloudflare Access JWT middleware | done |
| 5 | Byte-capped uploads (video job only if needed) | uploads done; video timing in task 9 |
| 6 | Dockerfile + compose | done |
| 7 | Server/backup/deploy scripts + runbook + GH deploy workflow | done |
| 8 | Account setup (user) | todo |
| 9 | Provision VM, migrate data, go live | todo |
| 10 | Verification + QA/security reviews | todo |

Previous feature ui-revamp: delivered, awaiting PR to main.

Verified: e2e 27/27 in dev mode and 27/27 against the Docker image; backup/restore round trip; remote-deploy forced command.
