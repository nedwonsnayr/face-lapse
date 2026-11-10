"""Person-scoped trash, transfers and on-demand archive health."""
import json
import shutil
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..config import DATA_DIR, ORIGINALS_DIR, ALIGNED_DIR
from ..database import get_db
from ..models import Image, Profile
from ..services import resize
from .profiles import get_profile_id
from .images import _content_version

router = APIRouter()


class Batch(BaseModel):
    image_ids: list[int] = Field(min_length=1, max_length=1000)


class Transfer(Batch):
    target_profile_id: int = Field(ge=1)
    mode: Literal['move', 'copy']


def records(db, ids, profile_id, trashed=False):
    query = db.query(Image).filter(Image.profile_id == profile_id, Image.id.in_(set(ids)))
    query = query.filter(Image.deleted_at.is_not(None) if trashed else Image.deleted_at.is_(None))
    found = query.all()
    if len(found) != len(set(ids)):
        raise HTTPException(404, 'One or more photos are no longer available in this person’s library')
    return found


@router.get('/trash')
def trash(db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    photos = db.query(Image).filter(Image.profile_id == profile_id, Image.deleted_at.is_not(None)).order_by(Image.deleted_at.desc()).all()
    return [dict(id=p.id, original_filename=p.original_filename, source_filename=p.source_filename,
                 photo_taken_at=p.photo_taken_at, deleted_at=p.deleted_at, content_hash=_content_version(p)) for p in photos]


@router.post('/trash')
def put_in_trash(body: Batch, db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    photos = records(db, body.image_ids, profile_id)
    for photo in photos:
        photo.deleted_at = datetime.now(timezone.utc)
    db.commit()
    return {'image_ids': [p.id for p in photos]}


@router.post('/restore')
def restore(body: Batch, db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    photos = records(db, body.image_ids, profile_id, trashed=True)
    hashes = [p.file_hash for p in photos if p.file_hash]
    if len(hashes) != len(set(hashes)):
        raise HTTPException(409, 'Select only one copy of each photo to restore')
    # Re-uploads while an earlier copy was in trash must never be overwritten.
    for photo in photos:
        if photo.file_hash and db.query(Image.id).filter(Image.profile_id == profile_id,
                Image.deleted_at.is_(None), Image.file_hash == photo.file_hash).first():
            raise HTTPException(409, 'This person already has a copy of one of these photos')
    for photo in photos:
        photo.deleted_at = None
    db.commit()
    return {'restored': len(photos)}


@router.delete('/trash/{image_id}')
def permanently_delete(image_id: int, db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    photo = records(db, [image_id], profile_id, trashed=True)[0]
    # Retain metadata if an unlink fails so a later retry can finish safely.
    for path in (photo.original_path, photo.aligned_path):
        if path:
            Path(path).unlink(missing_ok=True)
    resize.purge(photo.id)
    db.delete(photo)
    db.commit()
    return {'deleted': True}


@router.post('/transfer')
def transfer(body: Transfer, db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    if body.target_profile_id == profile_id:
        raise HTTPException(422, 'Choose another person')
    if db.get(Profile, body.target_profile_id) is None:
        raise HTTPException(404, 'Destination person not found')
    photos = records(db, body.image_ids, profile_id)
    hashes = [p.file_hash for p in photos if p.file_hash]
    if db.query(Image.id).filter(Image.profile_id == body.target_profile_id,
            Image.deleted_at.is_(None), Image.file_hash.in_(hashes)).first():
        raise HTTPException(409, 'The destination already has one of these photos. Nothing was changed.')
    created = []
    ids = []
    try:
        for photo in photos:
            if body.mode == 'move':
                photo.profile_id = body.target_profile_id
                photo.sort_order = None
                ids.append(photo.id)
                continue
            token = uuid.uuid4().hex
            original = ORIGINALS_DIR / f'copy-{token}{Path(photo.original_path).suffix}'
            created.append(original)
            shutil.copyfile(photo.original_path, original)
            aligned = None
            if photo.aligned_path:
                aligned = ALIGNED_DIR / f'copy-{token}.jpg'
                created.append(aligned)
                shutil.copyfile(photo.aligned_path, aligned)
            values = {column.name: getattr(photo, column.name) for column in Image.__table__.columns
                      if column.name not in {'id', 'profile_id', 'original_filename', 'original_path', 'aligned_path', 'sort_order', 'deleted_at'}}
            duplicate = Image(**values, profile_id=body.target_profile_id, original_filename=original.name,
                              original_path=str(original), aligned_path=str(aligned) if aligned else None)
            db.add(duplicate)
            db.flush()
            ids.append(duplicate.id)
        db.commit()
    except Exception:
        db.rollback()
        for path in created:
            path.unlink(missing_ok=True)
        raise
    return {'image_ids': ids, 'count': len(ids), 'mode': body.mode}


@router.get('/health')
def health(db: Session = Depends(get_db), profile_id: int = Depends(get_profile_id)):
    photos = db.query(Image).filter(Image.profile_id == profile_id).all()
    db.expunge_all()
    db.close()
    active = [p for p in photos if p.deleted_at is None]
    missing_originals = sum(not Path(p.original_path).is_file() for p in photos)
    missing_aligned = sum(bool(p.aligned_path) and not Path(p.aligned_path).is_file() for p in photos)
    backup = {'last_success': None, 'last_attempt': None, 'status': 'unknown'}
    try:
        recorded = json.loads((DATA_DIR / 'backup-status.json').read_text())
        for key in ('last_success', 'last_attempt'):
            value = recorded.get(key)
            if value:
                parsed = datetime.fromisoformat(value)
                if parsed.tzinfo is None:
                    raise ValueError('Missing timezone')
                backup[key] = parsed.isoformat()
        if recorded.get('status') in ('running', 'success', 'failed'):
            backup['status'] = recorded['status']
    except (OSError, ValueError, TypeError, AttributeError):
        backup = {'last_success': None, 'last_attempt': None, 'status': 'unknown'}
    return dict(photos=len(active), trashed=len(photos)-len(active),
                pending=sum(not p.align_attempted for p in active),
                needs_face_selection=sum(bool(p.needs_face_selection) for p in active),
                missing_originals=missing_originals, missing_aligned=missing_aligned,
                checked_at=datetime.now(timezone.utc).isoformat(), backup=backup)
