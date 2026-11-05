# Security review — cloud-hosting (2026-11-05)

## Exposure (verified live)
- `https://facelapse.ryanmsnowden.com/api/images` without a login returns 302 to the Cloudflare Access login.
- Ports 80, 443 and 8000 on the server's public IP don't connect. Inbound iptables allow only 22/tcp, which matches the VCN security list.
- At the origin, a request with no JWT gets 403 and a forged JWT gets 403. Only `/api/health` (200) is exempt.
- SSH: `passwordauthentication no`, `permitrootlogin no`, key-only (ed25519).

## Secrets
- The server's `.env` is mode 600. The laptop's `.env` is mode 600 and git-ignored.
- **Accepted risk (owner's decision):** the tunnel token, B2 key and restic password were shared in the chat transcript. The owner chose not to rotate them. Rotating any of them later is documented in `docs/hosting.md`.
- The B2 key is limited to one bucket and verified as such. Backups are encrypted client-side by restic.
- The CI deploy key (not yet created) is designed to use `command=...,restrict` and a pinned host key.

## Findings fixed during review
- The video download route accepted encoded path traversal (`..%2F`). Fixed: the resolved path must be inside `VIDEOS_DIR`.
- CORS wildcard removed in production.

## Residual
- An Oracle ephemeral public IP changes if the instance is stopped and started. SSH and deploys would need the new IP; the site is unaffected because it goes through the tunnel.
- In-memory video jobs: a restart mid-job makes the client show an error. Acceptable for one user.
