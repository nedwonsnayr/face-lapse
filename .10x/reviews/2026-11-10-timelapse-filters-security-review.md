# Security review: timelapse-filters (2026-11-10)
**Verdict:** no blockers. No new secrets, dependencies or outbound calls.

## Attack surface added
- `GET/POST/PUT/DELETE /api/filters` (shared presets).
- An optional JSON body on `POST /api/video/generate`.
- A WebGL2 shader fed by user-chosen numbers.

## Findings
| Area | Check | Result |
|---|---|---|
| AuthN | `CloudflareAccessMiddleware` covers every path except `/api/health` | `/api/filters` is protected like the rest of the API ✅ |
| AuthZ | Presets have no `profile_id` by design (user decision: shared by all people under the single owner login) | No cross-tenant concern in this single-owner deployment ✅ |
| Input validation | Pydantic `extra="forbid"` on the definition, preset input and export body; every number bounded; NaN rejected; `version` fixed to 1; tint colour `^#[0-9a-fA-F]{6}$`; blend enum | Unit tested (`test_filters`, `test_filter_presets`) ✅ |
| Names | Whitespace collapsed; 1–40 chars; unique ignoring case; IntegrityError → 409 | A 100 KB name returns 422 ✅ |
| XSS | Names render as React text only; there is no `innerHTML` or `dangerouslySetInnerHTML` in `frontend/src`; the colour only reaches `<input type=color>` and shader uniforms | ✅ |
| CSRF | Endpoints require a JSON body. `text/plain` and form-encoded POSTs get 422, so a cross-site attempt needs a preflighted request, and production has no CORS (same origin) | Same posture as the existing JSON endpoints ✅ |
| Injection | ORM queries with bound parameters (`lower(name) = ?`) | ✅ |
| DoS | 50-preset cap; the existing single-active-export admission (ADR-007) still bounds CPU. A filter adds about 100–150 ms per frame | Acceptable for a single owner ✅ |
| Untrusted storage | Definitions from localStorage and the API are re-validated client-side with `validateFilter` (exact keys, ranges) and dropped when invalid | ✅ |
| Shader | Integer math wraps by design (uint32); `x*cells` stays at or below 2²³; `texelFetch` stays within the image size | ✅ |

## Residual risk
- Anyone with app access can edit or delete any shared preset. This is intended.
