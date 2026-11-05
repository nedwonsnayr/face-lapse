"""Cloudflare Access JWT verification (defense in depth).

Cloudflare Access sits in front of the app and handles login. Every request
it forwards carries a signed JWT in the `Cf-Access-Jwt-Assertion` header. This
middleware checks that JWT against the team's public keys and the application's
AUD tag, so a request that reaches the origin some other way (a misconfigured
tunnel, an exposed port) is rejected rather than served.

Enabled only when CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD are set (see main.py).
"""

import logging

import jwt
from starlette.concurrency import run_in_threadpool
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

log = logging.getLogger("face-lapse.access")

HEADER = "cf-access-jwt-assertion"


class CloudflareAccessMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, team_domain: str, audience: str, exempt_paths: set[str] | None = None):
        super().__init__(app)
        team_domain = team_domain.removeprefix("https://").rstrip("/")
        self.issuer = f"https://{team_domain}"
        self.audience = audience
        self.exempt_paths = exempt_paths or set()
        # PyJWKClient caches keys and refetches on unknown `kid` (key rotation).
        self.jwks = jwt.PyJWKClient(f"{self.issuer}/cdn-cgi/access/certs", cache_keys=True, lifespan=3600)

    async def dispatch(self, request: Request, call_next):
        if request.url.path in self.exempt_paths:
            return await call_next(request)

        token = request.headers.get(HEADER) or request.cookies.get("CF_Authorization")
        if not token:
            return JSONResponse(status_code=403, content={"detail": "Missing Cloudflare Access token"})
        try:
            key = await run_in_threadpool(self.jwks.get_signing_key_from_jwt, token)
            jwt.decode(
                token,
                key.key,
                algorithms=["RS256"],
                audience=self.audience,
                issuer=self.issuer,
                options={"require": ["exp", "iat", "aud", "iss"]},
            )
        except jwt.PyJWKClientError as exc:
            log.error("Could not fetch Cloudflare Access keys: %s", exc)
            return JSONResponse(status_code=503, content={"detail": "Auth keys unavailable"})
        except jwt.InvalidTokenError as exc:
            log.warning("Rejected Access token on %s: %s", request.url.path, exc)
            return JSONResponse(status_code=403, content={"detail": "Invalid Cloudflare Access token"})

        return await call_next(request)
