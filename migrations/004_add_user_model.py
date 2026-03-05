"""Add User model and user_id to Image model."""

from sqlalchemy import text


def up(conn):
    """Add user_id column to images and create users table."""
    # Check if images table exists
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        # Table doesn't exist yet
        return False
    
    # Check if user_id column already exists
    cursor = conn.execute(text("PRAGMA table_info(images)"))
    columns = [row[1] for row in cursor.fetchall()]
    
    if 'user_id' in columns:
        # Column already exists, migration already applied
        return False
    
    # Create users table
    conn.execute(text("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            github_id INTEGER UNIQUE,
            github_username VARCHAR,
            github_email VARCHAR,
            github_avatar_url VARCHAR,
            access_token VARCHAR,
            created_at DATETIME,
            updated_at DATETIME
        )
    """))
    
    # Create default user (ID=1) if it doesn't exist
    conn.execute(text("""
        INSERT OR IGNORE INTO users (id, github_id, github_username, github_email)
        VALUES (1, 0, 'local_dev', 'local@dev.local')
    """))
    
    # Add user_id column to images table
    conn.execute(text("ALTER TABLE images ADD COLUMN user_id INTEGER NOT NULL DEFAULT 1"))
    
    # Update all existing images to have user_id = 1
    conn.execute(text("UPDATE images SET user_id = 1 WHERE user_id IS NULL OR user_id = 0"))
    
    # Create index on user_id
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_images_user_id ON images(user_id)"))
    
    conn.commit()
    return True


def down(conn):
    """Remove user_id column and users table (not fully supported for SQLite)."""
    # Remove index
    try:
        conn.execute(text("DROP INDEX IF EXISTS ix_images_user_id"))
    except Exception:
        pass
    
    # SQLite doesn't support DROP COLUMN directly, so we'd need to recreate the table
    # For now, just leave it - this is a one-way migration for safety
    conn.commit()
    return True