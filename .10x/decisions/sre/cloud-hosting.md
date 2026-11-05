# SRE — cloud-hosting
- SLO: best effort for a personal app. The real objective is zero photo loss: RPO 24 h (nightly backup), RTO a few hours (new VM + restic restore).
- Monitoring: a healthchecks.io ping after each successful backup (email when missed). Docker `restart: unless-stopped` on both containers.
- Runbook: `docs/hosting.md`.
