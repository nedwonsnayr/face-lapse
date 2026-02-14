"""Video generation and download endpoints."""

import logging
import time
from datetime import datetime
from pathlib import Path

from datetime import date, datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, Response
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

    # Collect paths, filtering out any missing files
    aligned_paths = []
    for img in images:
        if img.aligned_path and Path(img.aligned_path).exists():
            aligned_paths.append(img.aligned_path)

    if not aligned_paths:
        raise HTTPException(
            status_code=400,
            detail="No aligned image files found on disk",
        )

    # Generate video
    log.info(
        "Generating video: %d frames, %.2fs/frame (%.1fs total)",
        len(aligned_paths), frame_duration, len(aligned_paths) * frame_duration,
    )
    t0 = time.time()
    video_path = generate_video(aligned_paths, frame_duration=frame_duration)

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
        "frame_count": len(aligned_paths),
        "frame_duration": frame_duration,
        "total_duration": len(aligned_paths) * frame_duration,
        "video_filename": Path(video_path).name,
    }


@router.head("/latest")
@router.get("/latest")
def get_latest_video():
    """Return the most recently generated video, or 204 if none exist."""
    if not VIDEOS_DIR.exists():
        return Response(status_code=204)

    # Find the most recent mp4 file
    videos = sorted(VIDEOS_DIR.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
    if not videos:
        return Response(status_code=204)

    return FileResponse(
        str(videos[0]),
        media_type="video/mp4",
        filename=f"face-lapse-{date.today().strftime('%m-%d-%Y')}.mp4",
    )


@router.get("/{filename}")
def get_video_by_name(filename: str):
    """Download a specific generated video by filename."""
    video_path = VIDEOS_DIR / filename
    if not video_path.exists():
        raise HTTPException(status_code=404, detail="Video not found")

    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        filename=filename,
    )
