"""Video generation and download endpoints."""

import logging
import hashlib
import json
import threading
import time
import uuid
import re
from datetime import date, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

log = logging.getLogger("face-lapse.video")

from ..database import get_db
from ..models import Image
from ..config import VIDEOS_DIR, DEFAULT_FRAME_DURATION
from ..services.video import generate_video
from ..services.ordering import library_order
from .profiles import get_profile_id

router = APIRouter()

# ── Background jobs ──────────────────────────────────────────────
# Single-process registry: reuse matching work and bound CPU admission.
# Restart loses job/cache state; completed files retain their existing URLs.
_jobs: dict[str, dict] = {}
_jobs_lock = threading.Lock()
_MAX_JOBS = 20


def _export_key(metadata: list[dict], duration: float, dates: bool, age: bool) -> str:
    frames = []
    for item in metadata:
        stat = Path(item["path"]).stat()
        frames.append([
            item.get("id"), item["path"], item.get("revision"),
            stat.st_size, stat.st_mtime_ns, stat.st_ctime_ns,
            item.get("date").isoformat() if dates and item.get("date") else None,
            item.get("age") if age else None,
        ])
    payload = ["styled-export-v1", duration, dates, age, frames]
    return hashlib.sha256(json.dumps(payload, separators=(",", ":")).encode()).hexdigest()


def _public_job(job: dict) -> dict:
    return {key: value for key, value in job.items() if not key.startswith("_")}


def _run_job(job_id: str, image_metadata: list[dict], frame_duration: float, show_dates: bool, show_age: bool) -> None:
    t0 = time.monotonic()

    def progress(phase: str, completed: int, total: int) -> None:
        with _jobs_lock:
            _jobs[job_id].update(phase=phase, completed_frames=completed, frame_count=total)

    stable_key = None
    try:
        video_path = generate_video(
            image_metadata, frame_duration=frame_duration, show_dates=show_dates,
            show_age=show_age, on_progress=progress,
        )
        # Persist ownership in the filename, so downloads remain scoped after a
        # process restart evicts the in-memory job registry. Legacy files are Ryan's.
        profile_id = _jobs[job_id]["_profile_id"]
        if video_path and profile_id != 1:
            source = Path(video_path)
            target = source.with_name(f"person-{profile_id}-{source.name}")
            source.replace(target)
            video_path = str(target)
        # A source may have been re-aligned/deleted while the encoder was running.
        # Such a result can be downloaded, but must not be reused as a cache hit.
        if video_path:
            try:
                stable_key = _export_key(image_metadata, frame_duration, show_dates, show_age)
            except OSError:
                pass
    except Exception:
        log.exception("Video job %s crashed", job_id)
        video_path = None
    with _jobs_lock:
        job = _jobs[job_id]
        if stable_key != job["_key"]:
            job["_key"] = None
        if video_path:
            job.update(status="done", phase="done", video_filename=Path(video_path).name)
            log.info("Video ready: %s (%.1fs)", job["video_filename"], time.monotonic() - t0)
        else:
            job.update(status="error", phase="error", error="Could not create the video. Please try again.")
            log.error("Video generation failed while rendering or encoding")


def _start_job(image_metadata: list[dict], frame_duration: float, show_dates: bool, show_age: bool, profile_id: int = 1) -> dict:
    try:
        key = _export_key(image_metadata, frame_duration, show_dates, show_age)
    except OSError:
        raise HTTPException(status_code=409, detail="Photos changed. Refresh and try the export again.")
    with _jobs_lock:
        for existing in _jobs.values():
            if existing["_profile_id"] == profile_id and existing["_key"] == key and (
                existing["status"] == "running" or
                (existing["status"] == "done" and (VIDEOS_DIR / existing["video_filename"]).is_file())
            ):
                log.info("Reusing %s export job %s", existing["status"], existing["job_id"])
                return _public_job(existing)
        if any(job["status"] == "running" for job in _jobs.values()):
            raise HTTPException(status_code=409, detail="Another video is being created. Please try again when it finishes.")
        job_id = uuid.uuid4().hex
        job = {
            "job_id": job_id, "status": "running", "phase": "rendering",
            "completed_frames": 0, "frame_count": len(image_metadata),
            "frame_duration": frame_duration,
            "total_duration": len(image_metadata) * frame_duration,
            "video_filename": None, "error": None, "_key": key, "_profile_id": profile_id,
        }
        # At admission no active jobs remain, so oldest entries can be evicted.
        while len(_jobs) >= _MAX_JOBS:
            del _jobs[next(iter(_jobs))]
        _jobs[job_id] = job
        response = _public_job(job)
        try:
            threading.Thread(
                target=_run_job, args=(job_id, image_metadata, frame_duration, show_dates, show_age), daemon=True
            ).start()
        except Exception:
            del _jobs[job_id]
            raise
    return response


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
        description="Whether to show the date beneath each photo",
    ),
    show_age: bool = Query(default=False, description="Whether to show age beneath each photo"),
    birthday: str | None = Query(
        default=None,
        description="Birthday in YYYY-MM-DD format for age calculation",
    ),
    db: Session = Depends(get_db),
    profile_id: int = Depends(get_profile_id),
):
    """Generate an MP4 timelapse from all included aligned images."""
    # Get all included images with aligned versions
    images = (
        db.query(Image)
        .filter(Image.profile_id == profile_id, Image.included_in_video == True, Image.face_detected == True, Image.needs_face_selection == False)  # noqa: E712
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
    if show_age:
        if not birthday:
            raise HTTPException(status_code=422, detail="Enter a birthday to show age in the video")
        try:
            birth_date = datetime.strptime(birthday, "%Y-%m-%d").date()
        except ValueError:
            raise HTTPException(status_code=422, detail="Birthday must be a valid date in YYYY-MM-DD format")

    # Build image metadata (all images now have dates stored in DB)
    image_metadata = [
        {
            "id": img.id,
            "path": img.aligned_path,
            "revision": img.alignment_version,
            "date": img.photo_taken_at,
            "age": calculate_age(img.photo_taken_at, birth_date) if show_age else None,
        }
        for img in valid_images
    ]

    # Generate video in the background (see _start_job)
    log.info(
        "Generating video: %d frames, %.2fs/frame (%.1fs total), dates=%s, age=%s",
        len(valid_images), frame_duration, len(valid_images) * frame_duration, show_dates, show_age,
    )
    return JSONResponse(status_code=202, content=_start_job(image_metadata, frame_duration, show_dates, show_age, profile_id=profile_id))


@router.get("/jobs/{job_id}")
def get_job(job_id: str, profile_id: int = 1):
    """Poll a video generation job started by POST /generate."""
    with _jobs_lock:
        job = _jobs.get(job_id)
        if job is None or job["_profile_id"] != profile_id:
            raise HTTPException(status_code=404, detail="Video job not found (the server may have restarted)")
        return _public_job(job)


@router.get("/{filename}")
def get_video_by_name(filename: str, profile_id: int = Depends(get_profile_id)):
    """Download a specific generated video by filename."""
    owner = re.match(r"person-(\d+)-", filename)
    file_profile_id = int(owner.group(1)) if owner else 1
    if file_profile_id != profile_id:
        raise HTTPException(status_code=404, detail="Video not found")
    video_path = (VIDEOS_DIR / filename).resolve()
    if video_path.parent != VIDEOS_DIR.resolve() or not video_path.is_file():
        raise HTTPException(status_code=404, detail="Video not found")

    download_name = f"face-lapse-{date.today().strftime('%m-%d-%Y')}.mp4"
    return FileResponse(
        str(video_path),
        media_type="video/mp4",
        filename=download_name,
    )
