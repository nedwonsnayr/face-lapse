# Security: timelapse-filters
- **Threat surface:** `/api/filters` CRUD, an optional export JSON body, and a WebGL shader with bounded uniforms.
- **Controls:**
  - Cloudflare Access on every path except health.
  - Pydantic `extra=forbid` with bounded fields, a hex colour regex and a blend enum; NaN rejected.
  - Names are 1–40 chars and unique ignoring case; capped at 50 presets.
  - Text-only rendering.
  - JSON-only bodies: text/plain and form POSTs get 422.
- **Accepted:** presets are shared and editable by anyone with app access (single owner, by design).
- Full review: reviews/2026-11-10-timelapse-filters-security-review.md.
