# Staff Engineer — cloud-hosting
- All production behaviour is switched on by env vars (`FACE_LAPSE_DATA_DIR`, `FACE_LAPSE_STATIC_DIR`, `CF_ACCESS_*`). With none set, local dev and e2e tests behave exactly as before.
- Secrets live only in the VM's `.env` (git-ignored); `.env.example` documents them.
- Migrations follow the existing `migrations/NNN_*.py` + `up(conn)` pattern.
