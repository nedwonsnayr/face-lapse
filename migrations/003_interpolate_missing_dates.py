"""Migration: Interpolate and store dates for images missing photo_taken_at.

This migration calculates interpolated dates for all existing images that
don't have photo_taken_at, based on their chronological position relative
to images with known dates.
"""

from datetime import datetime, timedelta
from pathlib import Path
from sqlalchemy import text


def _interpolate_date_for_image(images_with_dates, images_without_dates, idx, known_date_indices, avg_interval):
    """Helper to interpolate a date for a specific image."""
    # Find the nearest known dates before and after
    before_idx = -1
    after_idx = -1

    for i in range(len(known_date_indices) - 1, -1, -1):
        if known_date_indices[i] < idx:
            before_idx = known_date_indices[i]
            break

    for i in range(len(known_date_indices)):
        if known_date_indices[i] > idx:
            after_idx = known_date_indices[i]
            break

    if before_idx >= 0 and after_idx >= 0:
        # Linear interpolation between two known dates
        before_date = images_with_dates[before_idx]["photo_taken_at"]
        after_date = images_with_dates[after_idx]["photo_taken_at"]
        if before_date and after_date:
            total_interval = after_date - before_date
            position = (idx - before_idx) / (after_idx - before_idx)
            return before_date + total_interval * position
    elif before_idx >= 0:
        # Extrapolate forward from last known date
        before_date = images_with_dates[before_idx]["photo_taken_at"]
        if before_date:
            offset = (idx - before_idx) * avg_interval
            return before_date + offset
    elif after_idx >= 0:
        # Extrapolate backward from first known date
        after_date = images_with_dates[after_idx]["photo_taken_at"]
        if after_date:
            offset = (idx - after_idx) * avg_interval
            return after_date + offset
    
    # Fallback
    return datetime.now()


def up(conn):
    """Apply the migration."""
    # Check if images table exists
    result = conn.execute(text(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='images'"
    ))
    if not result.fetchone():
        return False
    
    # Check if photo_taken_at column exists
    result = conn.execute(text("PRAGMA table_info(images)"))
    columns = [row[1] for row in result]
    
    if "photo_taken_at" not in columns:
        # Column doesn't exist, skip this migration
        return False
    
    # Count images without date
    result = conn.execute(text("SELECT COUNT(*) FROM images WHERE photo_taken_at IS NULL"))
    count = result.fetchone()[0]
    
    if count == 0:
        # All images already have dates
        return False
    
    # Get all images sorted chronologically (by sort_order, then filename, then created_at)
    # This matches the sorting logic used in the app
    result = conn.execute(text("""
        SELECT id, photo_taken_at, created_at, sort_order, original_filename
        FROM images
        ORDER BY 
            CASE WHEN sort_order IS NULL THEN 1 ELSE 0 END,
            sort_order,
            CAST(SUBSTR(original_filename, 1, INSTR(original_filename || '.', '.') - 1) AS INTEGER),
            photo_taken_at,
            created_at
    """))
    all_images = result.fetchall()
    
    if not all_images:
        return False
    
    # Helper to parse date string to datetime
    def parse_date(date_str):
        if not date_str:
            return None
        if isinstance(date_str, datetime):
            return date_str
        try:
            # Try parsing ISO format
            return datetime.fromisoformat(date_str.replace('Z', '+00:00'))
        except (ValueError, AttributeError):
            try:
                # Try parsing common formats
                return datetime.strptime(date_str, "%Y-%m-%d %H:%M:%S")
            except (ValueError, AttributeError):
                return None
    
    # Build list of images with their dates
    images_with_dates = []
    images_without_dates = []
    known_date_indices = []
    
    for idx, (img_id, photo_taken_at, created_at, sort_order, original_filename) in enumerate(all_images):
        parsed_photo_date = parse_date(photo_taken_at)
        parsed_created_date = parse_date(created_at)
        
        img_data = {
            "id": img_id,
            "photo_taken_at": parsed_photo_date,
            "created_at": parsed_created_date,
            "idx": idx,
        }
        images_with_dates.append(img_data)
        
        if parsed_photo_date:
            known_date_indices.append(idx)
        else:
            images_without_dates.append((idx, img_id))
    
    # If all images have dates, nothing to do
    if not images_without_dates:
        return False
    
    # If no images have dates, use created_at or evenly space
    if not known_date_indices:
        updated = 0
        for idx, img_id in images_without_dates:
            img_data = images_with_dates[idx]
            if img_data["created_at"]:
                interpolated_date = img_data["created_at"]
            else:
                # Evenly space over time range
                start_date = datetime.now() - timedelta(days=len(all_images))
                interpolated_date = start_date + timedelta(days=idx)
            
            # Convert datetime to ISO string for SQLite
            date_str = interpolated_date.isoformat() if interpolated_date else None
            conn.execute(
                text("UPDATE images SET photo_taken_at = :date WHERE id = :id"),
                {"date": date_str, "id": img_id}
            )
            updated += 1
        
        conn.commit()
        if updated > 0:
            print(f"✅ Interpolated dates for {updated} images (no known dates, used created_at/spacing)")
            return True
        return False
    
    # Calculate average interval between known dates
    avg_interval = timedelta(days=1)  # Default
    if len(known_date_indices) > 1:
        intervals = []
        for i in range(1, len(known_date_indices)):
            prev_idx = known_date_indices[i - 1]
            curr_idx = known_date_indices[i]
            prev_date = images_with_dates[prev_idx]["photo_taken_at"]
            curr_date = images_with_dates[curr_idx]["photo_taken_at"]
            if prev_date and curr_date:
                total_interval = curr_date - prev_date
                num_images = curr_idx - prev_idx
                if num_images > 0:
                    intervals.append(total_interval / num_images)
        if intervals:
            total_seconds = sum(d.total_seconds() for d in intervals)
            avg_interval = timedelta(seconds=total_seconds / len(intervals))
    else:
        # Single known date - use created_at spacing if available
        known_idx = known_date_indices[0]
        known_date = images_with_dates[known_idx]["photo_taken_at"]
        if known_date and images_with_dates[known_idx]["created_at"]:
            created_date = images_with_dates[known_idx]["created_at"]
            if known_idx > 0:
                time_diff = abs((created_date - known_date).total_seconds())
                avg_interval = timedelta(seconds=time_diff / known_idx)
            else:
                avg_interval = timedelta(days=1)
    
    # Interpolate dates for images without dates
    updated = 0
    for idx, img_id in images_without_dates:
        interpolated_date = _interpolate_date_for_image(
            images_with_dates, images_without_dates, idx, known_date_indices, avg_interval
        )
        
        # Convert datetime to ISO string for SQLite
        date_str = interpolated_date.isoformat() if interpolated_date else None
        conn.execute(
            text("UPDATE images SET photo_taken_at = :date WHERE id = :id"),
            {"date": date_str, "id": img_id}
        )
        updated += 1
    
    conn.commit()
    
    if updated > 0:
        print(f"✅ Interpolated and stored dates for {updated} images")
        return True
    
    return False


def down(conn):
    """Rollback the migration (not applicable - this is a data migration)."""
    raise NotImplementedError("Cannot rollback data migration")
