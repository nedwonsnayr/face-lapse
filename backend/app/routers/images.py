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
from fastapi.responses import FileResponse, JSONResponse, Response, StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db, SessionLocal, Base, engine
from ..models import Image, User
from ..config import ORIGINALS_DIR, ALIGNED_DIR, numeric_filename_key
from ..services.alignment import align_image, extract_exif_date, parse_date_from_filename
from ..services.storage import upload_file, download_file, delete_file, get_local_path_for_processing
from ..utils.date_interpolation import interpolate_and_store_dates
from ..auth import get_current_user

router = APIRouter()


def _get_next_counter(db: Session, user_id: int) -> int:
    """
    Find the highest integer filename currently in the DB for this user and return the next one.
    E.g. if the highest is '42.heic', returns 43.
    """
    all_filenames = db.query(Image.original_filename).filter(Image.user_id == user_id).all()
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


def _calculate_file_hash(filepath: Path) -> str:
    """Calculate MD5 hash of a file."""
    hash_md5 = hashlib.md5()
    with open(filepath, "rb") as f:
        for chunk in iter(lambda: f.read(4096), b""):
            hash_md5.update(chunk)
    return hash_md5.hexdigest()


@router.post("/upload")
async def upload_images(
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
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
    batch_hashes: dict[str, dict] = {}  # Track hashes within this batch to detect same-batch duplicates
    
    for file in files:
        ext = Path(file.filename or "image.jpg").suffix.lower()
        if ext not in (".jpg", ".jpeg", ".png", ".webp", ".heic", ".bmp", ".tiff"):
            ext = ".jpg"

        source_filename = file.filename or "unknown"
        temp_name = f"_tmp_{_extract_numeric_part(source_filename)}_{id(file)}{ext}"
        temp_path = ORIGINALS_DIR / temp_name
        content = await file.read()
        temp_path.write_bytes(content)

        # Calculate file hash for duplicate detection
        file_hash = _calculate_file_hash(temp_path)

        # First check if this hash was already seen in this batch
        if file_hash in batch_hashes:
            # Duplicate within the same batch - delete temp file and skip
            temp_path.unlink()
            existing_in_batch = batch_hashes[file_hash]
            log.info(
                "Skipped duplicate in batch: %s (matches %s in same batch)",
                source_filename,
                existing_in_batch["source_filename"],
            )
            saved_files.append({
                "temp_path": None,
                "source_filename": source_filename,
                "ext": ext,
                "photo_taken_at": None,
                "file_hash": file_hash,
                "duplicate": True,
                "existing_id": existing_in_batch.get("existing_id"),  # May be None if not yet in DB
                "existing_filename": existing_in_batch.get("existing_filename") or existing_in_batch["source_filename"],
            })
            continue

        # Check for duplicate in database by file_hash (indexed, fast) - only for this user
        existing_image = db.query(Image).filter(
            Image.file_hash == file_hash,
            Image.user_id == current_user.id
        ).first()
        
        if existing_image:
            # Duplicate found in database - delete temp file and skip
            temp_path.unlink()
            log.info(
                "Skipped duplicate: %s (matches existing %s)",
                source_filename,
                existing_image.original_filename,
            )
            saved_files.append({
                "temp_path": None,
                "source_filename": source_filename,
                "ext": ext,
                "photo_taken_at": None,
                "file_hash": file_hash,
                "duplicate": True,
                "existing_id": existing_image.id,
                "existing_filename": existing_image.original_filename,
            })
            # Track this in batch_hashes so subsequent duplicates in batch reference it
            batch_hashes[file_hash] = {
                "source_filename": source_filename,
                "existing_id": existing_image.id,
                "existing_filename": existing_image.original_filename,
            }
            continue

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
            "file_hash": file_hash,
            "duplicate": False,
        })
        # Track this hash in batch_hashes for duplicate detection within batch
        batch_hashes[file_hash] = {
            "source_filename": source_filename,
        }

    # Sort by photo date first (handles mixed filename formats like IMG_1234 + AirDrop UUIDs),
    # fall back to numeric filename part for files without dates
    saved_files.sort(key=lambda f: (
        f["photo_taken_at"] or datetime.max,
        _extract_numeric_part(f["source_filename"]),
    ))

    # Determine the starting counter
    start_counter = _get_next_counter(db, current_user.id)

    log.info(
        "Upload: %d files received, numbering from %d (source: %s … %s)",
        len(saved_files),
        start_counter,
        saved_files[0]["source_filename"] if saved_files else "?",
        saved_files[-1]["source_filename"] if saved_files else "?",
    )

    results = []
    saved_count = 0
    for idx, info in enumerate(saved_files):
        # Handle duplicates
        if info.get("duplicate"):
            # For duplicates, we need to return the existing image's ID so the frontend
            # can display the correct thumbnail. However, if existing_id is None
            # (same-batch duplicate not yet in DB), we can't return a valid ID.
            # In that case, we'll return -1 as a marker (frontend should handle this).
            existing_id = info.get("existing_id")
            if existing_id is None:
                # Same-batch duplicate - the first occurrence will be saved, so we
                # can't reference it yet. Return a placeholder.
                log.warning(
                    "Duplicate in batch without existing_id: %s",
                    info["source_filename"]
                )
                # For same-batch duplicates, we don't have the existing image ID yet,
                # but we can try to get the date from the first occurrence if it's already saved
                # For now, we'll return None for photo_taken_at in this case
                results.append({
                    "id": -1,  # Placeholder ID for same-batch duplicates
                    "original_filename": info.get("existing_filename") or info["source_filename"],
                    "source_filename": info["source_filename"],
                    "photo_taken_at": None,  # Can't determine date for same-batch duplicate yet
                    "created_at": None,  # Can't determine date for same-batch duplicate yet
                    "skipped": True,
                    "existing_id": None,
                })
            else:
                log.info(
                    "Returning duplicate response: source=%s, existing_id=%d, existing_filename=%s",
                    info["source_filename"],
                    existing_id,
                    info["existing_filename"],
                )
                # Get the existing image to include its photo_taken_at and created_at
                existing_image = db.query(Image).filter(Image.id == existing_id).first()
                results.append({
                    "id": existing_id,  # Use existing image's ID for thumbnail display
                    "original_filename": info["existing_filename"],
                    "source_filename": info["source_filename"],
                    "photo_taken_at": existing_image.photo_taken_at.isoformat() if existing_image and existing_image.photo_taken_at else None,
                    "created_at": existing_image.created_at.isoformat() if existing_image and existing_image.created_at else None,
                    "skipped": True,
                    "existing_id": existing_id,
                })
            continue

        counter = start_counter + saved_count
        int_filename = f"{counter}{info['ext']}"
        original_path = ORIGINALS_DIR / int_filename
        Path(info["temp_path"]).rename(original_path)

        # Upload to storage (local or cloud)
        storage_key = upload_file(
            original_path,
            int_filename,
            user_id=current_user.id,
            directory="originals"
        )
        
        image = Image(
            user_id=current_user.id,
            original_filename=int_filename,
            source_filename=info["source_filename"],
            original_path=storage_key,  # Now stores storage key instead of local path
            aligned_path=None,
            photo_taken_at=info["photo_taken_at"],
            face_detected=False,
            included_in_video=False,
            file_hash=info["file_hash"],
        )
        db.add(image)
        db.flush()
        log.info(
            "Saved new image: ID=%d, filename=%s, source=%s, hash=%s",
            image.id,
            image.original_filename,
            image.source_filename,
            image.file_hash[:8] if image.file_hash else "None",
        )
        results.append({
            "id": image.id,
            "original_filename": image.original_filename,
            "source_filename": image.source_filename,
            "photo_taken_at": image.photo_taken_at.isoformat() if image.photo_taken_at else None,
            "created_at": image.created_at.isoformat() if image.created_at else None,
            "skipped": False,  # Explicitly mark as not skipped
        })
        saved_count += 1

    db.commit()
    skipped_count = len(results) - saved_count
    if skipped_count > 0:
        log.info("Saved %d originals, skipped %d duplicates (not yet aligned)", saved_count, skipped_count)
    else:
        log.info("Saved %d originals (not yet aligned)", saved_count)
    
        # Interpolate dates for any newly saved images missing photo_taken_at
        new_image_ids = [r["id"] for r in results if r.get("id") and r.get("id") > 0 and not r.get("skipped")]
        if new_image_ids:
            # Check if any of the new images are missing dates (only for this user)
            images_without_dates = db.query(Image).filter(
                Image.id.in_(new_image_ids),
                Image.user_id == current_user.id,
                Image.photo_taken_at.is_(None)
            ).all()
        
        if images_without_dates:
            # Interpolate dates for images missing them
            updated_count = interpolate_and_store_dates(db, [img.id for img in images_without_dates])
            if updated_count > 0:
                log.info("Interpolated dates for %d newly uploaded images", updated_count)
    
    # Log the response structure for debugging
    log.info("Upload response: %d results", len(results))
    for r in results:
        log.info("  - ID=%s, skipped=%s, source=%s", r.get("id"), r.get("skipped"), r.get("source_filename"))
    
    return results


def _align_images_stream(image_ids: list[int], user_id: int) -> Generator[str, None, None]:
    """
    Generator that aligns each image and yields NDJSON progress lines.
    """
    db = SessionLocal()
    total = len(image_ids)
    all_results = []
    batch_start = time.time()

    log.info("Align: received image_ids=%s for user_id=%d", image_ids, user_id)

    try:
        for idx, image_id in enumerate(image_ids):
            t0 = time.time()
            log.info("Align: processing image_id=%d", image_id)
            # Filter by user_id to ensure users can only align their own images
            image = db.query(Image).filter(Image.id == image_id, Image.user_id == user_id).first()
            if not image:
                item_result = {
                    "id": image_id,
                    "original_filename": image.original_filename if image else "?",
                    "face_detected": False,
                    "error": "Image not found",
                }
                all_results.append(item_result)
                yield json.dumps({"type": "progress", "current": idx + 1, "total": total, "result": item_result}) + "\n"
                continue

            # Get local path for processing (downloads from cloud if needed)
            original_local_path = get_local_path_for_processing(image.original_path, user_id)
            
            stem = Path(image.original_filename).stem
            aligned_filename = f"{stem}.jpg"
            
            # Create temp aligned file
            import tempfile
            temp_dir = Path(tempfile.gettempdir()) / "face-lapse-alignment"
            temp_dir.mkdir(parents=True, exist_ok=True)
            temp_aligned_path = temp_dir / aligned_filename
            
            result = align_image(str(original_local_path), str(temp_aligned_path))
            
            # Upload aligned image to storage
            if result.success:
                aligned_storage_key = upload_file(
                    temp_aligned_path,
                    aligned_filename,
                    user_id=user_id,
                    directory="aligned"
                )
                # Clean up temp file
                temp_aligned_path.unlink(missing_ok=True)
            else:
                aligned_storage_key = None

            elapsed = time.time() - t0
            status = "OK" if result.success else f"FAIL ({result.error})"
            log.info(
                "  [%d/%d] %s  %.1fs  %s",
                idx + 1, total, image.original_filename, elapsed, status,
            )

            image.aligned_path = aligned_storage_key if result.success else None
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
            log.info("Align: returning result for image_id=%d -> result.id=%d, filename=%s", image_id, item_result["id"], item_result["original_filename"])
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
def align_images(
    body: AlignRequest,
    current_user: User = Depends(get_current_user),
):
    """
    Align one or more uploaded images by ID.
    Returns an NDJSON stream with per-image progress updates.
    """
    if not body.image_ids:
        raise HTTPException(status_code=400, detail="No image IDs provided")

    log.info("Align: %d images requested for user_id=%d", len(body.image_ids), current_user.id)
    return StreamingResponse(
        _align_images_stream(body.image_ids, current_user.id),
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
def list_images(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """List all images for the current user, sorted by: manual sort_order, then numeric filename, then date."""
    images = db.query(Image).filter(Image.user_id == current_user.id).all()
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
            "updated_at": img.updated_at.isoformat() if img.updated_at else None,
            "has_aligned": img.aligned_path is not None,
            "sort_order": img.sort_order,
        }
        for img in images
    ]

    # ETag based on content hash — allows 304 Not Modified responses
    # Serialize once and use the same bytes for both ETag and response body
    body_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    etag = f'"{hashlib.md5(body_bytes).hexdigest()}"'
    if request.headers.get("if-none-match") == etag:
        # 304 Not Modified - no body, just headers
        return Response(
            status_code=304,
            headers={"ETag": etag},
        )

    # Use the pre-serialized JSON to ensure Content-Length matches actual body
    return Response(
        content=body_bytes,
        media_type="application/json",
        headers={"ETag": etag},
    )


class ReorderItem(BaseModel):
    id: int
    sort_order: int


@router.patch("/reorder")
def reorder_images(
    items: List[ReorderItem] = Body(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Update sort_order for a batch of images to persist manual reordering."""
    for item in items:
        # Only allow reordering own images
        image = db.query(Image).filter(Image.id == item.id, Image.user_id == current_user.id).first()
        if image:
            image.sort_order = item.sort_order
    db.commit()
    return {"reordered": len(items)}


@router.delete("/no-face")
def delete_no_face_images(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete all images where no face was detected, along with their files."""
    images = db.query(Image).filter(
        Image.face_detected == False,  # noqa: E712
        Image.user_id == current_user.id
    ).all()
    deleted_count = 0
    for img in images:
        # Delete from storage (local or cloud)
        if img.original_path:
            try:
                delete_file(img.original_path, user_id=current_user.id)
            except Exception as e:
                log.warning(f"Failed to delete original {img.original_path}: {e}")
        if img.aligned_path:
            try:
                delete_file(img.aligned_path, user_id=current_user.id)
            except Exception as e:
                log.warning(f"Failed to delete aligned {img.aligned_path}: {e}")
        db.delete(img)
        deleted_count += 1
    db.commit()
    log.info("Dismissed %d no-face images", deleted_count)
    return {"deleted": deleted_count}


@router.get("/{image_id}/aligned")
def get_aligned_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve the aligned version of an image."""
    image = db.query(Image).filter(Image.id == image_id, Image.user_id == current_user.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    if not image.aligned_path:
        raise HTTPException(status_code=404, detail="Aligned image not available")
    
    # Get local path for serving (downloads from cloud if needed)
    local_path = get_local_path_for_processing(image.aligned_path, current_user.id)
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="Aligned image file not found")
    
    # Generate ETag based on file modification time and image updated_at for cache validation
    import hashlib
    import os
    file_stat = local_path.stat()
    etag_data = f"{file_stat.st_mtime}-{image.updated_at.isoformat() if image.updated_at else ''}"
    etag = hashlib.md5(etag_data.encode()).hexdigest()
    
    return FileResponse(
        local_path,
        media_type="image/jpeg",
        headers={
            "Cache-Control": "public, max-age=3600",  # Reduced from 1 year, removed immutable
            "ETag": f'"{etag}"',
        },
    )


@router.get("/{image_id}/original")
def get_original_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Serve the original version of an image."""
    image = db.query(Image).filter(Image.id == image_id, Image.user_id == current_user.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get local path for serving (downloads from cloud if needed)
    local_path = get_local_path_for_processing(image.original_path, current_user.id)
    if not local_path.exists():
        raise HTTPException(status_code=404, detail="Original image file not found")
    
    # Generate ETag based on file hash and updated_at timestamp for cache validation
    import hashlib
    import os
    file_stat = local_path.stat()
    etag_data = f"{image.file_hash or ''}-{file_stat.st_mtime}-{image.updated_at.isoformat() if image.updated_at else ''}"
    etag = hashlib.md5(etag_data.encode()).hexdigest()
    
    return FileResponse(
        local_path,
        headers={
            "Cache-Control": "public, max-age=3600",  # Reduced from 1 year, removed immutable
            "ETag": f'"{etag}"',
        },
    )


@router.delete("/{image_id}")
def delete_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Delete an image and its files from the library."""
    image = db.query(Image).filter(Image.id == image_id, Image.user_id == current_user.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    # Delete files from storage
    if image.original_path:
        try:
            delete_file(image.original_path, user_id=current_user.id)
        except Exception as e:
            log.warning(f"Failed to delete original {image.original_path}: {e}")
    if image.aligned_path:
        try:
            delete_file(image.aligned_path, user_id=current_user.id)
        except Exception as e:
            log.warning(f"Failed to delete aligned {image.aligned_path}: {e}")

    db.delete(image)
    db.commit()
    log.info("Deleted image %d (%s)", image_id, image.original_filename)
    return {"deleted": True, "id": image_id}


@router.patch("/{image_id}/toggle")
def toggle_image_inclusion(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Toggle whether an image is included in video generation."""
    image = db.query(Image).filter(Image.id == image_id, Image.user_id == current_user.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")

    image.included_in_video = not image.included_in_video
    db.commit()
    return {"id": image_id, "included_in_video": image.included_in_video}


@router.post("/{image_id}/realign")
def realign_image(
    image_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Re-run face alignment on an existing image."""
    image = db.query(Image).filter(Image.id == image_id, Image.user_id == current_user.id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    
    # Get local path for processing (downloads from cloud if needed)
    original_local_path = get_local_path_for_processing(image.original_path, current_user.id)
    if not original_local_path.exists():
        raise HTTPException(status_code=404, detail="Original image not found")

    stem = Path(image.original_filename).stem
    aligned_filename = f"{stem}.jpg"
    
    # Create temp aligned file
    import tempfile
    temp_dir = Path(tempfile.gettempdir()) / "face-lapse-alignment"
    temp_dir.mkdir(parents=True, exist_ok=True)
    temp_aligned_path = temp_dir / aligned_filename
    
    result = align_image(str(original_local_path), str(temp_aligned_path))
    
    # Upload aligned image to storage
    if result.success:
        aligned_storage_key = upload_file(
            temp_aligned_path,
            aligned_filename,
            user_id=current_user.id,
            directory="aligned"
        )
        # Clean up temp file
        temp_aligned_path.unlink(missing_ok=True)
        # Delete old aligned image if it exists
        if image.aligned_path:
            try:
                delete_file(image.aligned_path, user_id=current_user.id)
            except Exception:
                pass
    else:
        aligned_storage_key = None

    image.aligned_path = aligned_storage_key if result.success else None
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
