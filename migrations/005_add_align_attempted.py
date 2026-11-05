"""Migration: Add images.align_attempted.

Uploads are saved before alignment runs, and until now a staged upload looked
exactly like an image where no face was found. With the library auto-refreshing,
staged uploads would show up as "No face detected" (and "Dismiss All" would
delete them). This column records whether alignment has run.

Existing rows have all been through alignment, so they're backfilled to 1.
Idempotent.
"""

from sqlalchemy import text


def up(conn):
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        return False

    columns = [row[1] for row in conn.execute(text("PRAGMA table_info(images)"))]
    if "align_attempted" in columns:
        return False

    conn.execute(text(
        "ALTER TABLE images ADD COLUMN align_attempted BOOLEAN NOT NULL DEFAULT 1"
    ))
    conn.commit()
    return True


def down(conn):
    raise NotImplementedError("Rollback not supported for this migration")
