# Suppress MediaPipe/TensorFlow Lite warnings before any imports
import os
os.environ.setdefault("GLOG_minloglevel", "2")  # Suppress GLOG warnings
os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "2")  # Suppress TensorFlow warnings

import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import engine, Base
from .config import ensure_directories, DATA_DIR, CORS_ORIGINS, REQUIRE_AUTH
from .routers import images, video, auth

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
    from .auth import get_default_user
    from .database import SessionLocal
    Base.metadata.create_all(bind=engine)
    
    # Ensure default user exists for local development
    if not REQUIRE_AUTH:
        db = SessionLocal()
        try:
            get_default_user(db)
        finally:
            db.close()


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

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(video.router, prefix="/api/video", tags=["video"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
