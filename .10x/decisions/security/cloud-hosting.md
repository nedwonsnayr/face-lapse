# Security — cloud-hosting
- Threat: face photos exposed publicly. Controls:
  - No inbound ports except SSH (key-only).
  - Cloudflare Access email OTP for the owner only.
  - Backend JWT verification against the Access JWKS and AUD, so traffic that bypasses the tunnel still gets a 403.
- CORS wildcard removed in production (same origin).
- Backups are encrypted client-side by restic; the B2 key is scoped to one bucket. Losing the restic password means the backups can't be restored, so it goes in a password manager.
- CI deploy key: pinned with `command=...,restrict` in authorized_keys. A leaked key can only redeploy a commit that already exists on GitHub. Secrets live in the `production` environment; fork PRs never see them; the host key is pinned (`StrictHostKeyChecking=yes`).
