# Cloud hosting — design (2026-11-05)

## Goal
Reach Face Lapse from any device, and keep the photos somewhere other than the laptop. Budget: free where possible; the user accepted a ~$11/yr .com.

## Approved design
- **Compute:** one Oracle Cloud Always Free A1.Flex VM (4 OCPU / 24 GB, Ubuntu 24.04 aarch64, 100 GB boot volume), running Docker Compose.
  - `app`: one image containing the FastAPI backend, which also serves the built SPA. Data lives on the `./data:/data` volume. No published ports.
  - `cloudflared`: an outbound-only Cloudflare Tunnel to `facelapse.<domain>`.
- **Auth:** Cloudflare Access, email one-time code, allowing only the owner's email. The backend also verifies the `Cf-Access-Jwt-Assertion` JWT (enabled by env vars).
- **Backups:** nightly `restic` run to a private Backblaze B2 bucket. Retention is 7 daily, 4 weekly and 6 monthly; videos are excluded. healthchecks.io alerts on a missed run.
- **Portability:** migration 004 rewrites the absolute image paths stored in the DB to the current `DATA_DIR` on every startup.
- **Cloudflare limits:**
  - Uploads are capped at about 80 MB per request (Cloudflare allows 100 MB).
  - Video generation must finish in under about 100 s. Measure it on the VM; convert it to a background job only if needed.

## Out of scope
Multi-user support, CDN/object storage for serving images, CI auto-deploy and zero-downtime deploys.

## Cost
$0 for compute, tunnel, Access and backups up to 10 GB. The only cost is the domain, about $10.44–11.15/yr.
