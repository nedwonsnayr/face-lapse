"""Image upload, listing, deletion, and serving endpoints."""

import hashlib
import json
import logging
import re
import time
from datetime import datetime
from pathlib import Path
from typing import Generator, List

log = logging.getLogger("face-lapse.images")

from fastapi import APIRouter, Body, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal, Base, engine
from ..models import Image
from ..config import ORIGINALS_DIR, ALIGNED_DIR, numeric_filename_key
from ..services.alignment import align_image, extract_exif_date, parse_date_from_filename

router = APIRouter()


def _get_next_counter(db: Session) -> int:
    """
    Find the highest integer filename currently in the DB and return the next one.
    E.g. if the highest is '42.heic', returns 43.
    """
    all_filenames = db.query(Image.original_filename).all()
    max_num = 0
    for (fname,) in all_filenames:
        stem = Path(fname).stem
        try:
            num = int(stem)
            if num > max_num:
                max_num = num
        except ValueError:
            pass
    return max_num + 1


def _extract_numeric_part(filename: str) -> int:
    """Extract the first numeric run from a filename for sorting."""
    m = re.search(r"(\d+)", Path(filename).stem)
    return int(m.group(1)) if m else 0


@router.post("/upload")
async def upload_images(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    """
    Upload one or more images and store originals (no alignment yet).
    Files are auto-numbered sequentially from the highest existing number.
    Returns a JSON list of the created image records.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided")

    log.info("Upload request: %d file(s) — %s", len(files), [f.filename for f in files])

    saved_files: list[dict] = []
    for file in files:
        ext = Path(file.filename or "image.jpg").suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"):
            ext = ".jpg"

        source_filename = file.filename or "unknown"
        temp_name = f"_tmp_{_extract_numeric_part(source_filename)}_{id(file)}{ext}"
        temp_path = ORIGINALS_DIR / temp_name
        content = await file.read()
        temp_path.write_bytes(content)

        # Extract date: try EXIF first, then parse from filename
        exif_date_str = extract_exif_date(str(temp_path))
        photo_taken_at = None
        if exif_date_str:
            try:
                photo_taken_at = datetime.fromisoformat(exif_date_str)
            except ValueError:
                pass
        if photo_taken_at is None:
            photo_taken_at = parse_date_from_filename(source_filename)

        saved_files.append({
            "temp_path": str(temp_path),
            "source_filename": source_filename,
            "ext": ext,
            "photo_taken_at": photo_taken_at,
        })

    # Sort by photo date first (handles mixed filename formats like IMG_1234 + AirDrop UUIDs),
    # fall back to numeric filename part for files without dates
    saved_files.sort(key=lambda f: (
        f["photo_taken_at"] or datetime.max,
        _extract_numeric_part(f["source_filename"]),
    ))

    # Determine the starting counter
    start_counter = _get_next_counter(db)

    log.info(
        "Upload: %d files received, numbering from %d (source: %s … %s)",
        len(saved_files),
        start_counter,
        saved_files[0]["source_filename"] if saved_files else "?",
        saved_files[-1]["source_filename"] if saved_files else "?",
    )

    results = []
    for idx, info in enumerate(saved_files):
        counter = start_counter + idx
        int_filename = f"{counter}{info['ext']}"
        original_path = ORIGINALS_DIR / int_filename
        Path(info["temp_path"]).rename(original_path)

        image = Image(
            original_filename=int_filename,
            source_filename=info["source_filename"],
            original_path=str(original_path),
            aligned_path=None,
            photo_taken_at=info["photo_taken_at"],
            face_detected=False,
            included_in_video=False,
        )
        db.add(image)
        db.flush()
        results.append({
            "id": image.id,
            "original_filename": image.original_filename,
            "source_filename": image.source_filename,
        })

    db.commit()
    log.info("Saved %d originals (not yet aligned)", len(results))
    return results


def _align_images_stream(image_ids: list[int]) -> Generator[str, None, None]:
    """
    Generator that aligns each image and yields NDJSON progress lines.
    """
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()
    total = len(image_ids)
    all_results = []
    batch_start = time.time()

    try:
        for idx, image_id in enumerate(image_ids):
            t0 = time.time()
            image = db.query(Image).filter(Image.id == image_id).first()
            if not image or not Path(image.original_path).exists():
                item_result = {
                    "id": image_id,
                    "original_filename": image.original_filename if image else "?",
                    "face_detected": False,
                    "error": "Image not found",
                }
                all_results.append(item_result)
                yield json.dumps({"type": "progress", "current": idx + 1, "total": total, "result": item_result}) + "\n"
                continue

            stem = Path(image.original_filename).stem
            aligned_path = ALIGNED_DIR / f"{stem}.jpg"
            result = align_image(str(image.original_path), str(aligned_path))

            elapsed = time.time() - t0
            status = "OK" if result.success else f"FAIL ({result.error})"
            log.info(
                "  [%d/%d] %s  %.1fs  %s",
                idx + 1, total, image.original_filename, elapsed, status,
            )

            image.aligned_path = str(aligned_path) if result.success else None
            image.left_eye_x = result.left_eye[0] if result.left_eye else None
            image.left_eye_y = result.left_eye[1] if result.left_eye else None
            image.right_eye_x = result.right_eye[0] if result.right_eye else None
            image.right_eye_y = result.right_eye[1] if result.right_eye else None
            image.face_detected = result.success
            image.included_in_video = result.success

            item_result = {
                "id": image.id,
                "original_filename": image.original_filename,
                "face_detected": result.success,
                "error": result.error,
                "photo_taken_at": image.photo_taken_at.isoformat() if image.photo_taken_at else None,
            }
            all_results.append(item_result)
            yield json.dumps({"type": "progress", "current": idx + 1, "total": total, "result": item_result}) + "\n"

        db.commit()
        succeeded = sum(1 for r in all_results if r["face_detected"])
        failed = total - succeeded
        batch_elapsed = time.time() - batch_start
        log.info(
            "Alignment complete: %d images in %.1fs (%d aligned, %d no face)",
            total, batch_elapsed, succeeded, failed,
        )

        yield json.dumps({"type": "done", "aligned": len(all_results), "results": all_results}) + "\n"
    except Exception as e:
        db.rollback()
        log.error("Alignment failed: %s", e, exc_info=True)
        yield json.dumps({"type": "error", "detail": str(e)}) + "\n"
    finally:
        db.close()


class AlignRequest(BaseModel):
    image_ids: List[int]


@router.post("/align")
def align_images(body: AlignRequest):
    """
    Align one or more uploaded images by ID.
    Returns an NDJSON stream with per-image progress updates.
    """
    if not body.image_ids:
        raise HTTPException(status_code=400, detail="No image IDs provided")

    log.info("Align: %d images requested", len(body.image_ids))
    return StreamingResponse(
        _align_images_stream(body.image_ids),
        media_type="application/x-ndjson",
    )


def _sort_images(images: list) -> list:
    """
    Sort images by: manual sort_order first (nulls last), then by numeric
    filename (treating stems as integers), then by photo date, then created_at.
    """
    def key(img):
        sort_order = img.sort_order if img.sort_order is not None else float("inf")
        num_key = numeric_filename_key(img.original_filename)
        photo_ts = img.photo_taken_at or datetime.max
        created_ts = img.created_at or datetime.max
        return (sort_order, num_key, photo_ts, created_ts)

    return sorted(images, key=key)


@router.get("")
def list_images(request: Request, db: Session = Depends(get_db)):
    """List all images sorted by: manual sort_order, then numeric filename, then date."""
    images = db.query(Image).all()
    images = _sort_images(images)
    payload = [
        {
            "id": img.id,
            "original_filename": img.original_filename,
            "source_filename": img.source_filename,
            "face_detected": img.face_detected,
            "included_in_video": img.included_in_video,
            "photo_taken_at": img.photo_taken_at.isoformat() if img.photo_taken_at else None,
            "created_at": img.created_at.isoformat() if img.created_at else None,
            "has_aligned": img.aligned_path is not None,
            "sort_order": img.sort_order,
        }
        for img in images
    ]

    # ETag based on content hash — allows 304 Not Modified responses
    body = json.dumps(payload, separators=(",", ":")).encode()
    etag = f'"{hashlib.md5(body).hexdigest()}"'
    if request.headers.get("if-none-match") == etag:
        return JSONResponse(status_code=304, content=None, headers={"ETag": etag})

    return JSONResponse(content=payload, headers={"ETag": etag})


class ReorderItem(BaseModel):
    id: int
    sort_order: int


@router.patch("/reorder")
def reorder_images(
    items: List[ReorderItem] = Body(...),
    db: Session = Depends(get_db),
):
    """Update sort_order for a batch of images to persist manual reordering."""
    for item in items:
        image = db.query(Image).filter(Image.id == item.id).first()
        if image:
            image.sort_order = item.sort_order
    db.commit()
    return {"reordered": len(items)}


@router.delete("/no-face")
def delete_no_face_images(db: Session = Depends(get_db)):
    """Delete all images where no face was detected, along with their files."""
    images = db.query(Image).filter(Image.face_detected == False).all()  # noqa: E712
    deleted_count = 0
    for img in images:
        for path_str in [img.original_path, img.aligned_path]:
            if path_str:
                p = Path(path_str)
                if p.exists():
                    p.unlink()
        db.delete(img)
        deleted_count += 1
    db.commit()
    log.info("Dismissed %d no-face images", deleted_count)
    return {"deleted": deleted_count}


@router.get("/{image_id}/aligned")
def get_aligned_image(image_id: int, db: Session = Depends(get_db)):
    """Serve the aligned version of an image."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not image.aligned_path or not Path(image.aligned_path).exists():
        raise HTTPException(status_code=404, detail="Aligned image not available")
    return FileResponse(
        image.aligned_path,
        media_type="image/jpeg",
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.get("/{image_id}/original")
def get_original_image(image_id: int, db: Session = Depends(get_db)):
    """Serve the original version of an image."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not Path(image.original_path).exists():
        raise HTTPException(status_code=404, detail="Original image not found")
    return FileResponse(
        image.original_path,
        headers={"Cache-Control": "public, max-age=31536000, immutable"},
    )


@router.delete("/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    """Delete an image and its files from the library."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete files
    for path_str in [image.original_path, image.aligned_path]:
        if path_str:
            p = Path(path_str)
            if p.exists():
                p.unlink()

    db.delete(image)
    db.commit()
    log.info("Deleted image %d (%s)", image_id, image.original_filename)
    return {"deleted": True, "id": image_id}


@router.patch("/{image_id}/toggle")
def toggle_image_inclusion(image_id: int, db: Session = Depends(get_db)):
    """Toggle whether an image is included in video generation."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image.included_in_video = not image.included_in_video
    db.commit()
    return {"id": image_id, "included_in_video": image.included_in_video}


@router.post("/{image_id}/realign")
def realign_image(image_id: int, db: Session = Depends(get_db)):
    """Re-run face alignment on an existing image."""
    image = db.query(Image).filter(Image.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not Path(image.original_path).exists():
        raise HTTPException(status_code=404, detail="Original image not found on disk")

    stem = Path(image.original_filename).stem
    aligned_path = ALIGNED_DIR / f"{stem}.jpg"
    result = align_image(str(image.original_path), str(aligned_path))

    image.aligned_path = str(aligned_path) if result.success else None
    image.left_eye_x = result.left_eye[0] if result.left_eye else None
    image.left_eye_y = result.left_eye[1] if result.left_eye else None
    image.right_eye_x = result.right_eye[0] if result.right_eye else None
    image.right_eye_y = result.right_eye[1] if result.right_eye else None
    image.face_detected = result.success
    image.included_in_video = result.success
    db.commit()

    log.info("Re-aligned image %d (%s): %s", image_id, image.original_filename,
             "OK" if result.success else result.error)

    return {
        "id": image.id,
        "original_filename": image.original_filename,
        "face_detected": result.success,
        "error": result.error,
    }
