import os
import re
from pathlib import Path

# Base project directory (face-lapse/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Data directories — override with FACE_LAPSE_DATA_DIR env var for test isolation
DATA_DIR = Path(os.environ["FACE_LAPSE_DATA_DIR"]) if "FACE_LAPSE_DATA_DIR" in os.environ else PROJECT_ROOT / "data"
ORIGINALS_DIR = DATA_DIR / "originals"
ALIGNED_DIR = DATA_DIR / "aligned"
VIDEOS_DIR = DATA_DIR / "videos"

# Database
# Support both SQLite (local dev) and PostgreSQL (production)
# Set DATABASE_URL env var to use PostgreSQL, otherwise defaults to SQLite
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'face_lapse.db'}")

# Alignment settings
# Output resolution for aligned images (and therefore video resolution)
# Higher values = better quality but larger files and slower processing
OUTPUT_WIDTH = 1200
OUTPUT_HEIGHT = 1600
TARGET_EYE_DISTANCE = 240  # pixels between eye centers in aligned output (scaled proportionally)
# Eye center target position (x, y) in the output image
TARGET_LEFT_EYE = (OUTPUT_WIDTH // 2 - TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))
TARGET_RIGHT_EYE = (OUTPUT_WIDTH // 2 + TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))

# Video defaults
DEFAULT_FRAME_DURATION = 0.1  # seconds per frame

# Authentication
REQUIRE_AUTH = os.environ.get("REQUIRE_AUTH", "false").lower() == "true"

# Cloud Storage (R2/S3 compatible)
USE_CLOUD_STORAGE = os.environ.get("USE_CLOUD_STORAGE", "false").lower() == "true"
R2_ACCESS_KEY_ID = os.environ.get("R2_ACCESS_KEY_ID", "")
R2_SECRET_ACCESS_KEY = os.environ.get("R2_SECRET_ACCESS_KEY", "")
R2_BUCKET = os.environ.get("R2_BUCKET", "")
R2_ENDPOINT = os.environ.get("R2_ENDPOINT", "")  # e.g., https://<account-id>.r2.cloudflarestorage.com
R2_PUBLIC_URL = os.environ.get("R2_PUBLIC_URL", "")  # Public URL for accessing files (if using public bucket)

# GitHub OAuth
GITHUB_CLIENT_ID = os.environ.get("GITHUB_CLIENT_ID", "")
GITHUB_CLIENT_SECRET = os.environ.get("GITHUB_CLIENT_SECRET", "")
JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "dev-secret-key-change-in-production")
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = 24 * 7  # 7 days

# CORS
CORS_ORIGINS = os.environ.get("CORS_ORIGINS", "*").split(",") if os.environ.get("CORS_ORIGINS") else ["*"]


def ensure_directories() -> None:
    """Create data directories if they don't exist."""
    for d in [DATA_DIR, ORIGINALS_DIR, ALIGNED_DIR, VIDEOS_DIR]:
        d.mkdir(parents=True, exist_ok=True)


def numeric_filename_key(filename: str) -> tuple:
    """
    Sort key that treats filenames as integers when possible.
    Files named with integers (e.g. "1.jpg", "42.png") sort numerically.
    Non-numeric filenames sort after numeric ones, in lexicographic order.
    """
    stem = Path(filename).stem
    # Try the whole stem as an integer first
    try:
        return (0, int(stem), "")
    except ValueError:
        pass
    # Fallback: extract the first numeric run from the stem
    m = re.search(r"(\d+)", stem)
    if m:
        return (0, int(m.group(1)), stem)
    # No number at all – sort after all numeric names
    return (1, 0, stem)
