import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .database import engine, Base
from .config import ensure_directories, DATA_DIR
from .routers import images, video

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

log = logging.getLogger("face-lapse")


def _ensure_tables():
    """Create all tables if they don't already exist."""
    from . import models  # noqa: F401
    Base.metadata.create_all(bind=engine)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    ensure_directories()
    _ensure_tables()
    log.info("Started — data dir: %s", DATA_DIR)
    yield
    log.info("Shutting down")


app = FastAPI(title="Face Lapse", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(images.router, prefix="/api/images", tags=["images"])
app.include_router(video.router, prefix="/api/video", tags=["video"])


@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    log.error("Unhandled error on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(status_code=500, content={"detail": str(exc)})


@app.get("/api/health")
def health_check():
    return {"status": "ok"}
