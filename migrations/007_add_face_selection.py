"""Persist per-photo face candidates and selection, preserving existing output."""
from sqlalchemy import text


def up(conn):
    columns = {row[1] for row in conn.execute(text("PRAGMA table_info(images)"))}
    additions = {
        "face_candidates": "JSON",
        "selected_face_index": "INTEGER",
        "needs_face_selection": "BOOLEAN NOT NULL DEFAULT 0",
        "alignment_version": "VARCHAR NOT NULL DEFAULT ''",
    }
    changed = False
    for name, declaration in additions.items():
        if name not in columns:
            conn.execute(text(f"ALTER TABLE images ADD COLUMN {name} {declaration}"))
            changed = True
    conn.commit()
    return changed
