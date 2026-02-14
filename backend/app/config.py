import re
from pathlib import Path

# Base project directory (face-lapse/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# Data directories
DATA_DIR = PROJECT_ROOT / "data"
ORIGINALS_DIR = DATA_DIR / "originals"
ALIGNED_DIR = DATA_DIR / "aligned"
VIDEOS_DIR = DATA_DIR / "videos"

# Database
DATABASE_URL = f"sqlite:///{DATA_DIR / 'face_lapse.db'}"

# Alignment settings
OUTPUT_WIDTH = 600
OUTPUT_HEIGHT = 800
TARGET_EYE_DISTANCE = 120  # pixels between eye centers in aligned output
# Eye center target position (x, y) in the output image
TARGET_LEFT_EYE = (OUTPUT_WIDTH // 2 - TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))
TARGET_RIGHT_EYE = (OUTPUT_WIDTH // 2 + TARGET_EYE_DISTANCE // 2, int(OUTPUT_HEIGHT * 0.38))

# Video defaults
DEFAULT_FRAME_DURATION = 0.1  # seconds per frame


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
