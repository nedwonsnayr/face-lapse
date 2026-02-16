"""Date interpolation utility for images missing photo_taken_at."""

from datetime import datetime, timedelta
from typing import Any

from sqlalchemy.orm import Session

from ..models import Image


def interpolate_dates(images: list[Image]) -> list[dict[str, Any]]:
    """
    Interpolate dates for images missing photo_taken_at based on chronological position.
    
    Images should already be sorted chronologically.
    Returns list of dicts with 'interpolated_date' field (datetime or None).
    """
    if not images:
        return []

    # Find indices of images with known dates
    known_date_indices: list[int] = []
    for idx, img in enumerate(images):
        if img.photo_taken_at:
            known_date_indices.append(idx)

    # If all images have dates, return as-is
    if len(known_date_indices) == len(images):
        return [
            {
                "id": img.id,
                "path": img.aligned_path,
                "date": img.photo_taken_at,
            }
            for img in images
        ]

    # If no images have dates, use created_at or evenly space
    if len(known_date_indices) == 0:
        has_created_at = any(img.created_at for img in images)
        if has_created_at:
            # Use created_at timestamps
            return [
                {
                    "id": img.id,
                    "path": img.aligned_path,
                    "date": img.created_at,
                }
                for img in images
            ]
        else:
            # Evenly space over a reasonable time range (1 day per image)
            start_date = datetime.now() - timedelta(days=len(images))
            return [
                {
                    "id": img.id,
                    "path": img.aligned_path,
                    "date": start_date + timedelta(days=idx),
                }
                for idx, img in enumerate(images)
            ]

    # Calculate average interval between known dates
    avg_interval = timedelta(days=1)  # Default
    if len(known_date_indices) > 1:
        intervals: list[timedelta] = []
        for i in range(1, len(known_date_indices)):
            prev_idx = known_date_indices[i - 1]
            curr_idx = known_date_indices[i]
            prev_date = images[prev_idx].photo_taken_at
            curr_date = images[curr_idx].photo_taken_at
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
        known_date = images[known_idx].photo_taken_at
        if known_date and images[known_idx].created_at:
            created_date = images[known_idx].created_at
            if known_idx > 0:
                time_diff = abs((created_date - known_date).total_seconds())
                avg_interval = timedelta(seconds=time_diff / known_idx)
            else:
                avg_interval = timedelta(days=1)

    # Interpolate dates
    result = []
    for idx, img in enumerate(images):
        # If image has a date, use it
        if img.photo_taken_at:
            result.append({
                "id": img.id,
                "path": img.aligned_path,
                "date": img.photo_taken_at,
            })
            continue

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

        interpolated_date: datetime

        if before_idx >= 0 and after_idx >= 0:
            # Linear interpolation between two known dates
            before_date = images[before_idx].photo_taken_at
            after_date = images[after_idx].photo_taken_at
            if before_date and after_date:
                total_interval = after_date - before_date
                position = (idx - before_idx) / (after_idx - before_idx)
                interpolated_date = before_date + total_interval * position
            else:
                interpolated_date = datetime.now()
        elif before_idx >= 0:
            # Extrapolate forward from last known date
            before_date = images[before_idx].photo_taken_at
            if before_date:
                offset = (idx - before_idx) * avg_interval
                interpolated_date = before_date + offset
            else:
                interpolated_date = datetime.now()
        elif after_idx >= 0:
            # Extrapolate backward from first known date
            after_date = images[after_idx].photo_taken_at
            if after_date:
                offset = (idx - after_idx) * avg_interval
                interpolated_date = after_date + offset
            else:
                interpolated_date = datetime.now()
        else:
            # Fallback (shouldn't happen)
            interpolated_date = datetime.now()

        result.append({
            "id": img.id,
            "path": img.aligned_path,
            "date": interpolated_date,
        })

    return result


def interpolate_and_store_dates(db: Session, image_ids: list[int] | None = None) -> int:
    """
    Interpolate and store dates for images missing photo_taken_at.
    
    If image_ids is provided, only interpolate dates for those specific images.
    Otherwise, interpolate dates for all images missing photo_taken_at.
    
    Images are sorted chronologically before interpolation.
    Returns the number of images updated.
    """
    from ..routers.images import _sort_images
    
    # Get images to process
    if image_ids:
        images = db.query(Image).filter(Image.id.in_(image_ids)).all()
    else:
        images = db.query(Image).filter(Image.photo_taken_at.is_(None)).all()
    
    if not images:
        return 0
    
    # Get all images sorted chronologically (needed for interpolation context)
    all_images = db.query(Image).all()
    all_images_sorted = _sort_images(all_images)
    
    # Build mapping of image ID to index in sorted list
    id_to_index = {img.id: idx for idx, img in enumerate(all_images_sorted)}
    
    # Find indices of images with known dates
    known_date_indices: list[int] = []
    for idx, img in enumerate(all_images_sorted):
        if img.photo_taken_at:
            known_date_indices.append(idx)
    
    # If no images have dates, use created_at or evenly space
    if not known_date_indices:
        updated = 0
        for img in images:
            if img.created_at:
                interpolated_date = img.created_at
            else:
                # Evenly space over time range
                start_date = datetime.now() - timedelta(days=len(all_images_sorted))
                img_idx = id_to_index.get(img.id, 0)
                interpolated_date = start_date + timedelta(days=img_idx)
            
            img.photo_taken_at = interpolated_date
            updated += 1
        
        db.commit()
        return updated
    
    # Calculate average interval between known dates
    avg_interval = timedelta(days=1)  # Default
    if len(known_date_indices) > 1:
        intervals: list[timedelta] = []
        for i in range(1, len(known_date_indices)):
            prev_idx = known_date_indices[i - 1]
            curr_idx = known_date_indices[i]
            prev_date = all_images_sorted[prev_idx].photo_taken_at
            curr_date = all_images_sorted[curr_idx].photo_taken_at
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
        known_date = all_images_sorted[known_idx].photo_taken_at
        if known_date and all_images_sorted[known_idx].created_at:
            created_date = all_images_sorted[known_idx].created_at
            if known_idx > 0:
                time_diff = abs((created_date - known_date).total_seconds())
                avg_interval = timedelta(seconds=time_diff / known_idx)
            else:
                avg_interval = timedelta(days=1)
    
    # Interpolate dates for images without dates
    updated = 0
    for img in images:
        if img.photo_taken_at:
            continue  # Already has a date
        
        idx = id_to_index.get(img.id, -1)
        if idx < 0:
            continue  # Image not found in sorted list (shouldn't happen)
        
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

        interpolated_date: datetime

        if before_idx >= 0 and after_idx >= 0:
            # Linear interpolation between two known dates
            before_date = all_images_sorted[before_idx].photo_taken_at
            after_date = all_images_sorted[after_idx].photo_taken_at
            if before_date and after_date:
                total_interval = after_date - before_date
                position = (idx - before_idx) / (after_idx - before_idx)
                interpolated_date = before_date + total_interval * position
            else:
                interpolated_date = datetime.now()
        elif before_idx >= 0:
            # Extrapolate forward from last known date
            before_date = all_images_sorted[before_idx].photo_taken_at
            if before_date:
                offset = (idx - before_idx) * avg_interval
                interpolated_date = before_date + offset
            else:
                interpolated_date = datetime.now()
        elif after_idx >= 0:
            # Extrapolate backward from first known date
            after_date = all_images_sorted[after_idx].photo_taken_at
            if after_date:
                offset = (idx - after_idx) * avg_interval
                interpolated_date = after_date + offset
            else:
                interpolated_date = datetime.now()
        else:
            # Fallback (shouldn't happen)
            interpolated_date = datetime.now()
        
        img.photo_taken_at = interpolated_date
        updated += 1
    
    db.commit()
    return updated
