# SRE — cloud-hosting
- SLO: best effort for a personal app. The real objective is zero photo loss: RPO 24 h (nightly backup), RTO a few hours (new VM + restic restore).
- Monitoring: a healthchecks.io ping after each successful backup (email when missed). Docker `restart: unless-stopped` on both containers.
- Runbook: `docs/hosting.md`.
- Live 2026-11-05 on 193.122.143.130 (A1.Flex 4 OCPU / 23 GB, Ubuntu 24.04). Backup cron 03:17 UTC; the first backup took 64 s for 3.9 GiB. healthchecks.io is wired up.
- Video generation takes 96–150 s, so it runs as a background job (in memory) with the client polling.
