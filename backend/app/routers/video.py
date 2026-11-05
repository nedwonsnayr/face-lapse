"""Video generation and download endpoints."""

import logging
import threading
import time
import uuid
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

log = logging.getLogger("face-lapse.video")

from ..database import get_db
from ..models import Image
from ..config import VIDEOS_DIR, DEFAULT_FRAME_DURATION, numeric_filename_key
from ..services.video import generate_video
from ..services.ordering import library_order

router = APIRouter()

# ── Background jobs ──────────────────────────────────────────────
# Generating a 1,000+ frame video takes ~1.5–2.5 min on the server, longer than
# Cloudflare's ~100 s proxy timeout. So /generate starts a job and returns at
# once; the client polls /jobs/{id}. Jobs live in memory (single process, single
# user); a restart just loses in-flight jobs, which the client reports as an error.
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_MAX_JOBS = 20


def _run_job(job_id: str, image_metadata: list[dict], frame_duration: float, show_dates: bool) -> None:
    t0 = time.time()
    try:
        video_path = generate_video(image_metadata, frame_duration=frame_duration, show_dates=show_dates)
    except Exception:  # noqa: BLE001 — surface any failure to the poller
        log.exception("Video job %s crashed", job_id)
        video_path = None
    with _jobs_lock:
        job = _jobs[job_id]
        if video_path:
            job.update(status="done", video_filename=Path(video_path).name)
            log.info("Video ready: %s (%.1fs)", job["video_filename"], time.time() - t0)
        else:
            job.update(status="error", error="Video generation failed. Ensure FFmpeg is installed (brew install ffmpeg).")
            log.error("Video generation failed (ffmpeg error)")


def _start_job(image_metadata: list[dict], frame_duration: float, show_dates: bool) -> dict:
    job_id = uuid.uuid4().hex
    job = {
        "job_id": job_id,
        "status": "running",
        "frame_count": len(image_metadata),
        "frame_duration": frame_duration,
        "total_duration": len(image_metadata) * frame_duration,
        "video_filename": None,
        "error": None,
    }
    with _jobs_lock:
        # Drop the oldest finished jobs so the dict can't grow without bound.
        finished = [k for k, v in _jobs.items() if v["status"] != "running"]
        for k in finished[: max(0, len(_jobs) - _MAX_JOBS + 1)]:
            del _jobs[k]
        _jobs[job_id] = job
    threading.Thread(
        target=_run_job, args=(job_id, image_metadata, frame_duration, show_dates), daemon=True
    ).start()
    return dict(job)


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

    # Same order as the library and the in-app player.
    images = library_order(images)

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

    # Generate video in the background (see _start_job)
    show_age = birthday is not None and show_dates
    log.info(
        "Generating video: %d frames, %.2fs/frame (%.1fs total), dates=%s, age=%s",
        len(valid_images), frame_duration, len(valid_images) * frame_duration, show_dates, show_age,
    )
    return JSONResponse(status_code=202, content=_start_job(image_metadata, frame_duration, show_dates))


@router.get("/jobs/{job_id}")
def get_job(job_id: str):
    """Poll a video generation job started by POST /generate."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(status_code=404, detail="Video job not found (the server may have restarted)")
        return dict(job)


@router.get("/{filename}")
def get_video_by_name(filename: str):
    """Download a specific generated video by filename."""
    video_path = (VIDEOS_DIR / filename).resolve()
    if video_path.parent != VIDEOS_DIR.resolve() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Video not found")

    download_name = f"face-lapse-{date.today().strftime('%m-%d-%Y')}.mp4"
    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        filename=download_name,
    )
