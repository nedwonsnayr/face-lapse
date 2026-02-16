"""Migration: Add file_hash column to images table.

This migration adds the file_hash column for duplicate detection.
It's idempotent and safe to run multiple times.
"""

from sqlalchemy import text


def up(conn):
    """Apply the migration."""
    # Check if images table exists
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        # Table doesn't exist yet
        return False
    
    # Check if file_hash column already exists
    result = conn.execute(text("PRAGMA table_info(images)"))
    columns = [row[1] for row in result]
    
    if "file_hash" in columns:
        # Column already exists
        return False
    
    # Add the column
    conn.execute(text("ALTER TABLE images ADD COLUMN file_hash VARCHAR"))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_images_file_hash ON images(file_hash)"))
    conn.commit()
    return True


def down(conn):
    """Rollback the migration (not implemented for SQLite)."""
    # SQLite doesn't support dropping columns easily
    # This would require recreating the table, which is complex
    raise NotImplementedError("Rollback not supported for this migration")
