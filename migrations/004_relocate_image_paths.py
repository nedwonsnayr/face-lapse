"""Migration: Point stored image paths at the current data directory.

`images.original_path` and `images.aligned_path` hold absolute paths, such as
/Users/<you>/src/face-lapse/data/originals/1.jpg. When the data directory
moves (to a server, a Docker volume or a restored backup), those paths break.

This rewrites any path that isn't already under the current ORIGINALS_DIR /
ALIGNED_DIR to "<current dir>/<basename>". It is idempotent and always
returns False, so the runner never records it and it runs on every startup.
That makes any future move of the data directory heal itself.
"""

import logging
from pathlib import Path

from sqlalchemy import text

from backend.app.config import ALIGNED_DIR, ORIGINALS_DIR

log = logging.getLogger("face-lapse.migrations")


def _relocate(path_str: str | None, target_dir: Path) -> str | None:
    if not path_str:
        return None
    path = Path(path_str)
    if path.parent == target_dir:
        return None
    return str(target_dir / path.name)


def up(conn):
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        return False

    rows = conn.execute(text("SELECT id, original_path, aligned_path FROM images")).fetchall()
    changed = 0
    for image_id, original_path, aligned_path in rows:
        new_original = _relocate(original_path, ORIGINALS_DIR)
        new_aligned = _relocate(aligned_path, ALIGNED_DIR)
        if new_original is None and new_aligned is None:
            continue
        conn.execute(
            text(
                "UPDATE images SET original_path = :o, aligned_path = :a WHERE id = :id"
            ),
            {
                "o": new_original or original_path,
                "a": new_aligned or aligned_path,
                "id": image_id,
            },
        )
        changed += 1

    if changed:
        conn.commit()
        log.info("Relocated stored paths for %d images to %s", changed, ORIGINALS_DIR.parent)
    # Never recorded: re-checks on every startup (cheap, a single SELECT).
    return False


def down(conn):
    raise NotImplementedError("Paths are re-derived from the data dir; nothing to roll back")
