# DevOps — cloud-hosting
- Build: a multi-stage Dockerfile (node builds the SPA, python:3.12-slim runs it). The image is built on the VM, which is native arm64.
- Deploy: `scripts/deploy.sh` (ssh → git pull → `docker compose up -d --build`). Expect a few seconds of downtime per deploy, which is acceptable for one user.
- Rollback: `git checkout <prev>` on the VM, then `docker compose up -d --build`. Migrations are additive or idempotent.
- Host setup: `scripts/server-setup.sh` (Docker, restic, ufw allowing SSH only, key-only SSH, unattended-upgrades, swap).
