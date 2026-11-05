# DevOps — cloud-hosting
- Build: a multi-stage Dockerfile (node builds the SPA, python:3.12-slim runs it). The image is built on the VM, which is native arm64.
- Deploy: `scripts/deploy.sh` (ssh → git pull → `docker compose up -d --build`). Expect a few seconds of downtime per deploy, which is acceptable for one user.
- Rollback: `git checkout <prev>` on the VM, then `docker compose up -d --build`. Migrations are additive or idempotent.
- Host setup: `scripts/server-setup.sh` (Docker, restic, ufw allowing SSH only, key-only SSH, unattended-upgrades, swap).
- CD (requested 2026-11-05): `.github/workflows/deploy.yml` runs on push to `main` and by `workflow_dispatch` (any ref). It SSHes with a key that is forced to `scripts/remote-deploy.sh`, which accepts only `deploy <40-hex sha>` for a commit on origin: fetch → `checkout --force --detach` → `compose up --build` → health wait. It skips cleanly until the `DEPLOY_HOST` secret exists.
- Deviation from plan: no ufw. Oracle's Ubuntu image already restricts inbound traffic to SSH through iptables plus the VCN security list, and ufw conflicts with netfilter-persistent.
