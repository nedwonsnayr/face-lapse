import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .database import engine, Base
from .config import ensure_directories, DATA_DIR, STATIC_DIR, CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD
from .access import CloudflareAccessMiddleware
from .routers import images, video, profiles, archive, filters

# ── Logging setup ────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-5s  %(name)s  %(message)s",
    datefmt="%H:%M:%S",
    stream=sys.stdout,
)
# Silence noisy third-party loggers
for _name in ("mediapipe", "PIL", "matplotlib"):
    logging.getLogger(_name).setLevel(logging.WARNING)


class _QuietAccessFilter(logging.Filter):
    """Suppress access-log lines for high-frequency image-serving endpoints."""
    _NOISY = ("/aligned", "/original")

    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        return not any(p in msg for p in self._NOISY)


class _SuppressContentLengthError(logging.Filter):
    """Suppress harmless uvicorn Content-Length mismatch errors."""
    def filter(self, record: logging.LogRecord) -> bool:
        msg = record.getMessage()
        # Suppress the known harmless RuntimeError about Content-Length
        if "Response content longer than Content-Length" in msg:
            return False
        return True


logging.getLogger("uvicorn.access").addFilter(_QuietAccessFilter())
logging.getLogger("uvicorn.error").addFilter(_SuppressContentLengthError())

log = logging.getLogger("face-lapse")


def _ensure_tables():
    """Create all tables if they don't already exist."""
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)


def _run_migrations():
    """Run database migrations."""
    import sys
    from pathlib import Path
    
    # Add project root to path so migrations can be imported
    project_root = Path(__file__).parent.parent.parent
    if str(project_root) not in sys.path:
        sys.path.insert(0, str(project_root))
    
    from migrations.runner import run_migrations
    run_migrations(engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_directories()
    _ensure_tables()
    _run_migrations()
    log.info("Started — data dir: %s", DATA_DIR)
    yield
    log.info("Shutting down")


app = FastAPI(title="Face Lapse", version="1.0.0", lifespan=lifespan)

if STATIC_DIR is None:
    # Local dev: Vite on :5173 talks to the API on :8000. In production the SPA
    # is served from this same origin, so no CORS is needed.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=["*"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

if CF_ACCESS_TEAM_DOMAIN and CF_ACCESS_AUD:
    app.add_middleware(
        CloudflareAccessMiddleware,
        team_domain=CF_ACCESS_TEAM_DOMAIN,
        audience=CF_ACCESS_AUD,
        exempt_paths={"/api/health"},
    )

app.include_router(archive.router, prefix="/api/archive", tags=["archive"])
app.include_router(profiles.router, prefix="/api/profiles", tags=["profiles"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(video.router, prefix="/api/video", tags=["video"])
app.include_router(filters.router, prefix="/api/filters", tags=["filters"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/api/health")
def health_check():
    return {"status": "ok"}


# ── Production: serve the built SPA from this origin ─────────────
if STATIC_DIR is not None:
    _static_root = STATIC_DIR.resolve()
    if (_static_root / "assets").is_dir():
        app.mount("/assets", StaticFiles(directory=_static_root / "assets"), name="assets")

    @app.get("/{full_path:path}", include_in_schema=False)
    def spa(full_path: str):
        if full_path.startswith("api/") or full_path == "api":
            return JSONResponse(status_code=404, content={"detail": "Not Found"})
        candidate = (_static_root / full_path).resolve()
        if full_path and candidate.is_file() and candidate.is_relative_to(_static_root):
            return FileResponse(candidate)
        return FileResponse(_static_root / "index.html")
