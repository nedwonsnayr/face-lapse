# Security review: timelapse-prefetch (2026-11-11)
- **What changed:** frontend only. Same-origin GETs of existing immutable frame URLs, with the Access cookie via `credentials: "same-origin"`.
- **What didn't:** no new endpoints, inputs, storage or third parties, and the cache headers are unchanged.
- **Findings:** none.
