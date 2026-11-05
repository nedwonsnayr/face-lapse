# SDE — cloud-hosting (built 2026-11-05)

## Built
- `migrations/004_relocate_image_paths.py`: runs on every startup and fixes absolute paths. Tested on a copy of the real DB: 1,035 rows rewritten, second run a no-op.
- `backend/app/main.py`: serves the SPA when `FACE_LAPSE_STATIC_DIR` is set; CORS only in dev; mounts the Access middleware.
- `backend/app/access.py`: Cloudflare Access JWT check (RS256, aud, iss, exp). 9 forged-token cases pass; tested with a throwaway script, not committed.
- `backend/app/services/video.py`: font candidate list with a DejaVu fallback.
- `frontend/src/api.ts`: `batchFiles()` caps each request at 20 files / 80 MB.
- `Dockerfile`, `docker-compose.yml` (app + cloudflared 2025.10.0), `.env.example`, `.dockerignore`, `make test-e2e-docker`.
- `scripts/server-setup.sh`, `backup.sh` (restore tested in an Ubuntu 24.04 container), `deploy.sh`, `remote-deploy.sh` (forced-command test passed), `.github/workflows/deploy.yml` (actionlint clean), `docs/hosting.md`.

## Deviations
- **MediaPipe pinned 0.10.21 → 0.10.18:** 0.10.21 has no linux aarch64 wheel. Aligned output is pixel-identical on the fixtures.
- **No ufw:** see the devops notes.
- **Added a GitHub Actions deploy** at the user's request mid-implementation.

## Tech debt / open
- Video generation is still synchronous. It needs timing on the VM (Cloudflare's limit is 100 s) before deciding whether to make it a background job.
- No Python unit-test harness in the repo; the backend checks above were ad hoc.
- 2026-11-05 go-live: the video background job was needed, and is built (`routers/video.py` `_start_job`/`get_job`, `api.ts` polling). Fixed a pipefail bug in server-setup's cron line.
