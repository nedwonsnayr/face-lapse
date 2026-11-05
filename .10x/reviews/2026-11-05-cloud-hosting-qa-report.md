# QA report — cloud-hosting (2026-11-05)

## Automated
| Suite | Result |
|---|---|
| e2e, dev mode (`make test-e2e`) | 27/27 pass (re-run after the video job change; includes a real MP4 download) |
| e2e, production Docker image (`make test-e2e-docker`) | 27/27 pass (before the video job change; the dev run covers that code path) |
| Migration 004 on a copy of the real DB | 1,035 rows relocated; second run is a no-op |
| Access JWT middleware (ad-hoc) | 9/9 cases: valid header or cookie → 200; missing, garbage, wrong aud/iss/key, or expired → 403 |
| `batchFiles` (ad-hoc) | count cap, byte cap, oversize file sent alone, empty input |
| Backup → restore round trip (Ubuntu 24.04 container) | Originals byte-identical; videos and live DB excluded; DB snapshot has 1,035 rows |
| `remote-deploy.sh` forced command (container, stubbed docker) | Injection attempt and unknown SHA rejected; correct SHA deployed; .env and data untouched |
| `deploy.yml` | actionlint clean |
| MediaPipe 0.10.21 → 0.10.18 | Aligned fixture output pixel-identical |
| Video job endpoints (TestClient) | Empty library → 400; unknown job → 404; path traversal → 404 |

## On the live server (193.122.143.130, facelapse.ryanmsnowden.com)
- The image builds natively on arm64 in about 3 minutes. Both containers are healthy, and the tunnel registered 4 connections (iad05/iad09).
- 1,035 originals uploaded (4.0 GB). Migration 004 relocated all of them to `/data`.
- First backup: 3.92 GiB, 2,078 files, 64 s. `restic check --read-data-subset=5%` found no errors.
- Video generation timed on the server: 95.6 s (no dates) and 149.8 s (dates), over Cloudflare's ~100 s limit. Converted to a background job and redeployed.

## Not yet verified (needs the owner's browser login)
- Browse the library, upload a HEIC batch, and Download Video through `facelapse.ryanmsnowden.com` after logging in.
- The GitHub Actions deploy: the branch isn't pushed and the secrets aren't set.
