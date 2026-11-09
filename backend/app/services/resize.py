"""Smaller copies of images for the UI, made on first request and cached on disk.

Aligned images are 1200x1600 (~450 KB). The library shows them ~130 px wide and
the player at phone size, so serving full size costs mobile users ~20x the bytes.
Copies live in THUMBS_DIR, are named by image id + content version + source kind + size (so a
reused id or new content never hits a stale file), and can be deleted at any
time — they're regenerated on demand and excluded from backups.
"""

import logging
import os
import tempfile
from pathlib import Path

from PIL import Image as PILImage, ImageOps
from pillow_heif import register_heif_opener

from ..config import THUMBS_DIR

register_heif_opener()
log = logging.getLogger("face-lapse.resize")

# name -> (max width, max height, JPEG quality)
SIZES = {
    "thumb": (300, 400, 75),   # library tiles, staging tray
    "frame": (600, 800, 80),   # timelapse player
}


def resized_path(source: Path, image_id: int, version: str, size: str, kind: str) -> Path:
    """Return the cached resized copy of `source`, creating it if needed."""
    max_w, max_h, quality = SIZES[size]
    target = THUMBS_DIR / f"{image_id}-{version}-{kind}-{size}.jpg"
    if target.exists():
        return target

    with PILImage.open(source) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        img.thumbnail((max_w, max_h), PILImage.Resampling.LANCZOS)
        # Write to a temp file and rename, so concurrent requests never see a
        # half-written image.
        fd, tmp = tempfile.mkstemp(dir=THUMBS_DIR, suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                img.save(f, "JPEG", quality=quality, optimize=True, progressive=True)
            os.replace(tmp, target)
        except BaseException:
            Path(tmp).unlink(missing_ok=True)
            raise
    return target


def purge(image_id: int) -> None:
    """Remove every cached copy for an image (on delete or re-align)."""
    for p in THUMBS_DIR.glob(f"{image_id}-*"):
        p.unlink(missing_ok=True)
