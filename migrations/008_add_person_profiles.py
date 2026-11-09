"""Add person profiles; preserve every existing photo under Ryan (id 1)."""
from sqlalchemy import text


def up(conn):
    conn.execute(text("""CREATE TABLE IF NOT EXISTS profiles (
        id INTEGER PRIMARY KEY, name VARCHAR(80) NOT NULL, birthday VARCHAR(10)
    )"""))
    conn.execute(text("INSERT OR IGNORE INTO profiles(id, name, birthday) VALUES (1, 'Ryan', '1995-10-06')"))
    exists = conn.execute(text("SELECT name FROM sqlite_master WHERE type='table' AND name='images'")).first()
    if exists:
        columns = {row[1] for row in conn.execute(text("PRAGMA table_info(images)"))}
        if 'profile_id' not in columns:
            # SQLite rejects adding a REFERENCES column with a non-null default
            # while FK checks are enabled. Startup is not yet serving requests;
            # disable checks only on this migration connection, then restore.
            foreign_keys = conn.execute(text("PRAGMA foreign_keys")).scalar()
            conn.commit()
            if foreign_keys:
                conn.execute(text("PRAGMA foreign_keys=OFF"))
            try:
                conn.execute(text("ALTER TABLE images ADD COLUMN profile_id INTEGER NOT NULL DEFAULT 1 REFERENCES profiles(id)"))
                conn.commit()
            except Exception:
                conn.rollback()
                raise
            finally:
                if foreign_keys:
                    conn.execute(text("PRAGMA foreign_keys=ON"))
            if conn.execute(text("PRAGMA foreign_key_check(images)")).first():
                raise RuntimeError("Profile migration found an image with an invalid person")
        conn.execute(text("CREATE INDEX IF NOT EXISTS ix_images_profile_id ON images(profile_id)"))
    conn.commit()
    return True


def down(conn):
    raise NotImplementedError("Additive migration: roll back the code without removing profiles or photos")
