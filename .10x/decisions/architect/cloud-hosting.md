# Architect — cloud-hosting (ADR-003)
- Topology: browser → Cloudflare edge (Access) → Tunnel → `cloudflared` container → `app:8000` on the compose network. The VM has no inbound HTTP.
- One origin: FastAPI serves `frontend/dist` when `FACE_LAPSE_STATIC_DIR` is set, with SPA fallback for non-`/api` paths, so CORS isn't needed in production.
- State: `/data` volume (originals, aligned, videos, SQLite). It stays a single writer; SQLite is fine for one user.
- Portability: DB paths are rewritten to the current `DATA_DIR` on startup (migration 004).
- Failure modes:
  - Request bodies over 100 MB → byte-capped upload batches.
  - Responses over ~100 s → measure video generation; switch to a background job if needed.
  - VM loss → restore from B2.
