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
THUMBS_DIR = DATA_DIR / "thumbs"  # resized copies for the UI; safe to delete

# Production: built SPA served by FastAPI when set (e.g. /app/frontend/dist)
STATIC_DIR = Path(os.environ["FACE_LAPSE_STATIC_DIR"]) if os.environ.get("FACE_LAPSE_STATIC_DIR") else None

# Cloudflare Access JWT verification — enabled only when both are set
CF_ACCESS_TEAM_DOMAIN = os.environ.get("CF_ACCESS_TEAM_DOMAIN", "").strip()  # e.g. "myteam.cloudflareaccess.com"
CF_ACCESS_AUD = os.environ.get("CF_ACCESS_AUD", "").strip()

# Storage limits. The nightly backup (scripts/backup.sh) reads the same two alert variables from .env,
# so the warning in Archive health matches the email alert.
FREE_TIER_REPO_BYTES = 10_000_000_000  # Backblaze B2's free 10 GB


def _positive_number(name: str, default: float) -> float:
    try:
        value = float(os.environ.get(name, "").strip() or default)
    except ValueError:
        return default
    return value if value > 0 else default


STORAGE_ALERT_REPO_BYTES = int(_positive_number("STORAGE_ALERT_REPO_BYTES", 8_000_000_000))
STORAGE_ALERT_DISK_PCT = _positive_number("STORAGE_ALERT_DISK_PCT", 80)

# Exported MP4s older than this many days are deleted (0 keeps them forever; invalid values use 7)
try:
    VIDEO_RETENTION_DAYS = float(os.environ.get("VIDEO_RETENTION_DAYS", "").strip() or 7)
except ValueError:
    VIDEO_RETENTION_DAYS = 7.0
if VIDEO_RETENTION_DAYS < 0:
    VIDEO_RETENTION_DAYS = 7.0

# Database
DATABASE_URL = f"sqlite:///{DATA_DIR / 'face_lapse.db'}"

# Alignment settings (also define the generated video resolution)
OUTPUT_WIDTH = 1200
OUTPUT_HEIGHT = 1600
TARGET_EYE_DISTANCE = 240  # pixels between eye centers in aligned output
# Eye center target position (x, y) in the output image
TARGET_LEFT_EYE = (OUTPUT_WIDTH // 2 - TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))
TARGET_RIGHT_EYE = (OUTPUT_WIDTH // 2 + TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))

# Video defaults
DEFAULT_FRAME_DURATION = 0.1  # seconds per frame


def ensure_directories() -> None:
    """Create data directories if they don't exist."""
    for d in [DATA_DIR, ORIGINALS_DIR, ALIGNED_DIR, VIDEOS_DIR, THUMBS_DIR]:
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
