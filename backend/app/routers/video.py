"""Video generation and download endpoints."""

import logging
import time
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

log = logging.getLogger("face-lapse.video")

from ..database import get_db
from ..models import Image
from ..config import VIDEOS_DIR, DEFAULT_FRAME_DURATION, numeric_filename_key
from ..services.video import generate_video

router = APIRouter()


@router.post("/generate")
def generate_timelapse(
    frame_duration: float = Query(
        default=DEFAULT_FRAME_DURATION,
        ge=0.01,
        le=5.0,
        description="Duration in seconds each image is shown",
    ),
    show_dates: bool = Query(
        default=False,
        description="Whether to overlay dates on video frames",
    ),
    birthday: str | None = Query(
        default=None,
        description="Birthday in YYYY-MM-DD format for age calculation",
    ),
    db: Session = Depends(get_db),
):
    """Generate an MP4 timelapse from all included aligned images."""
    # Get all included images with aligned versions
    images = (
        db.query(Image)
        .filter(Image.included_in_video == True, Image.face_detected == True)  # noqa: E712
        .all()
    )

    # Sort using numeric filename sort (consistent with the images list endpoint)
    def _sort_key(img):
        sort_order = img.sort_order if img.sort_order is not None else float("inf")
        num_key = numeric_filename_key(img.original_filename)
        photo_ts = img.photo_taken_at or datetime.max
        created_ts = img.created_at or datetime.max
        return (sort_order, num_key, photo_ts, created_ts)

    images = sorted(images, key=_sort_key)

    if not images:
        raise HTTPException(
            status_code=400,
            detail="No aligned images available for video generation",
        )

    # Collect paths and metadata, filtering out any missing files
    valid_images = []
    for img in images:
        if img.aligned_path and Path(img.aligned_path).exists():
            valid_images.append(img)

    if not valid_images:
        raise HTTPException(
            status_code=400,
            detail="No aligned image files found on disk",
        )

    # Calculate age for each image if birthday is provided
    def calculate_age(photo_date: datetime | None, birth_date: date | None) -> int | None:
        if not photo_date or not birth_date:
            return None
        age = photo_date.year - birth_date.year
        if (photo_date.month, photo_date.day) < (birth_date.month, birth_date.day):
            age -= 1
        return age if age >= 0 else None

    birth_date = None
    if birthday:
        try:
            birth_date = datetime.strptime(birthday, "%Y-%m-%d").date()
        except ValueError:
            log.warning("Invalid birthday format: %s, ignoring", birthday)

    # Build image metadata (all images now have dates stored in DB)
    image_metadata = [
        {
            "id": img.id,
            "path": img.aligned_path,
            "date": img.photo_taken_at if show_dates else None,
            "age": calculate_age(img.photo_taken_at, birth_date) if birthday and show_dates else None,
        }
        for img in valid_images
    ]

    # Generate video
    show_age = birthday is not None and show_dates
    log.info(
        "Generating video: %d frames, %.2fs/frame (%.1fs total), dates=%s, age=%s",
        len(valid_images), frame_duration, len(valid_images) * frame_duration, show_dates, show_age,
    )
    t0 = time.time()
    video_path = generate_video(
        image_metadata,
        frame_duration=frame_duration,
        show_dates=show_dates,
    )

    if not video_path:
        log.error("Video generation failed (ffmpeg error)")
        raise HTTPException(
            status_code=500,
            detail="Video generation failed. Ensure FFmpeg is installed (brew install ffmpeg).",
        )

    elapsed = time.time() - t0
    log.info("Video ready: %s (%.1fs)", Path(video_path).name, elapsed)

    return {
        "success": True,
        "frame_count": len(valid_images),
        "frame_duration": frame_duration,
        "total_duration": len(valid_images) * frame_duration,
        "video_filename": Path(video_path).name,
    }


@router.get("/{filename}")
def get_video_by_name(filename: str):
    """Download a specific generated video by filename."""
    video_path = VIDEOS_DIR / filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    download_name = f"face-lapse-{date.today().strftime('%m-%d-%Y')}.mp4"
    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        filename=download_name,
    )
