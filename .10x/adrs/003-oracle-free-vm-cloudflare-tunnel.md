# ADR-003: Self-host on an Oracle Always Free VM behind Cloudflare Tunnel + Access

**Status:** Accepted
**Date:** 2026-11-05
**Feature:** cloud-hosting
**Author:** 10x-Team (Architect + Staff Engineer)

## Context
The app is local-only. It needs Python with MediaPipe, OpenCV and FFmpeg, a SQLite file, and a 4.3 GB (and growing) image store on local disk. The owner wants access from anywhere, data off the laptop, and close to $0 cost. The images are face photos, so they must not be publicly reachable.

## Decision
Run the existing app, unchanged in shape, as a Docker container on an Oracle Cloud Always Free ARM VM.
- Expose it only through an outbound Cloudflare Tunnel, gated by Cloudflare Access (email OTP for the single owner).
- The backend verifies the Access JWT as defense in depth.
- Back up nightly with restic to Backblaze B2.

## Alternatives Considered
| Alternative | Pros | Cons | Why Not |
|---|---|---|---|
| Hetzner VPS (~€4–5/mo) | Reliable, simple | Costs money; 4 GB RAM / 40 GB disk | User prefers free |
| Keep on the Mac + Tailscale + B2 sync | $0, no migration | Laptop must be on to use the app | Fails "access from anywhere" |
| Tailscale Funnel + app-level login | No domain needed | We own the auth code and its security | User chose a domain + Access |
| Serverless rewrite (Pages + R2 + MediaPipe JS) | Scales to zero | Rewrite of alignment and video | Far too much work |
| Render/Fly free tiers | Managed | Too little RAM for MediaPipe; no free persistent disk | Not viable |

## Consequences
### Positive
- No inbound ports and no auth code we have to maintain.
- Plenty of RAM and CPU for alignment.
- Encrypted, off-site, versioned backups.
### Negative
- We operate a VM ourselves: OS patching (handled by unattended-upgrades) and deploys over SSH.
- Cloudflare limits apply: 100 MB request bodies and a ~100 s proxied response timeout.
### Risks
- **Oracle reclaims idle Always Free VMs.** Mitigation: upgrade the account to Pay-As-You-Go (still $0 within limits) and set a $1 budget alert.
- **A1 capacity is scarce in some regions.** Mitigation: try several availability domains, or retry later.
- **Oracle account loss.** Mitigation: B2 backups plus a documented restore.

## Dependencies
Cloudflare-managed domain, Oracle account, B2 bucket. Constrains future multi-user work, which would need app-level identity from the Access JWT email claim.
