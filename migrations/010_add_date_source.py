"""Preserve historical dates without claiming to know their provenance."""
from sqlalchemy import text


def up(conn):
    columns = {row[1] for row in conn.execute(text('PRAGMA table_info(images)'))}
    if 'date_source' not in columns:
        conn.execute(text("ALTER TABLE images ADD COLUMN date_source VARCHAR NOT NULL DEFAULT 'legacy'"))
    conn.commit()
    return True


def down(conn):
    raise NotImplementedError('Keep date provenance; older code can ignore the column')
