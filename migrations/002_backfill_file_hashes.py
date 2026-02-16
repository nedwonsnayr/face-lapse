"""Migration: Backfill file_hash for existing images.

This migration calculates and stores file_hash for all existing images
that don't have one yet. This improves duplicate detection performance.
"""

from pathlib import Path
from sqlalchemy import text


def up(conn):
    """Apply the migration."""
    # Check if images table exists
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        return False
    
    # Check if file_hash column exists
    result = conn.execute(text("PRAGMA table_info(images)"))
    columns = [row[1] for row in result]
    
    if "file_hash" not in columns:
        # Column doesn't exist, skip this migration
        return False
    
    # Count images without hash
    result = conn.execute(text("SELECT COUNT(*) FROM images WHERE file_hash IS NULL"))
    count = result.fetchone()[0]
    
    if count == 0:
        # All images already have hashes
        return False
    
    # Import hash calculation function
    import sys
    from pathlib import Path as PathLib
    sys.path.insert(0, str(PathLib(__file__).parent.parent))
    
    from backend.app.routers.images import _calculate_file_hash
    from backend.app.config import ORIGINALS_DIR
    
    # Get all images without hash
    result = conn.execute(text(
        "SELECT id, original_path FROM images WHERE file_hash IS NULL"
    ))
    images_to_update = result.fetchall()
    
    updated = 0
    for img_id, original_path in images_to_update:
        if not original_path or not Path(original_path).exists():
            continue
        
        try:
            file_hash = _calculate_file_hash(Path(original_path))
            conn.execute(
                text("UPDATE images SET file_hash = :hash WHERE id = :id"),
                {"hash": file_hash, "id": img_id}
            )
            updated += 1
        except Exception as e:
            # Log but continue
            print(f"Warning: Failed to calculate hash for {original_path}: {e}")
            continue
    
    conn.commit()
    
    if updated > 0:
        print(f"✅ Backfilled file_hash for {updated} images")
        return True
    
    return False


def down(conn):
    """Rollback the migration (not applicable - this is a data migration)."""
    raise NotImplementedError("Cannot rollback data migration")
