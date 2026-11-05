"""Migration: Clear saved photo positions once (library order is now by date).

Library order became "date taken, adjusted by drags" (services/ordering.py).
Positions saved before that were made while the library didn't show the
result of a drag, and drags in "Just uploaded" could push photos to the front,
so the owner chose to start over from date order. Runs once; drags made
afterwards are kept. The nightly backup still has the old values.
"""

from sqlalchemy import text


def up(conn):
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if result.fetchone():
        conn.execute(text("UPDATE images SET sort_order = NULL"))
        conn.commit()
    # Recorded even on a fresh database, so it never clears later drags.
    return True


def down(conn):
    raise NotImplementedError("The old positions are in the backup if ever needed")
