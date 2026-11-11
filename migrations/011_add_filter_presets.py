"""Saved filter looks, shared by every person (no profile_id)."""
from sqlalchemy import text


def up(conn):
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS filter_presets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name VARCHAR(40) NOT NULL UNIQUE,
            definition JSON NOT NULL,
            created_at DATETIME,
            updated_at DATETIME
        )
    """))
    conn.commit()
    return True


def down(conn):
    raise NotImplementedError('Keep saved filters; older code ignores the table')
