from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, JSON, ForeignKey
from .database import Base

def _utcnow():
    return datetime.now(timezone.utc)


class Profile(Base):
    __tablename__ = "profiles"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(80), nullable=False)
    birthday = Column(String(10), nullable=True)


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    profile_id = Column(Integer, ForeignKey("profiles.id"), nullable=False, default=1, server_default="1", index=True)
    original_filename = Column(String, nullable=False)  # Integer-based name (e.g. "43.heic")
    source_filename = Column(String, nullable=True)      # Phone's original name (e.g. "IMG_0733.HEIC")
    original_path = Column(String, nullable=False)
    aligned_path = Column(String, nullable=True)

    # Calendar time used for sorting/captions, with explicit provenance.
    photo_taken_at = Column(DateTime, nullable=True)
    date_source = Column(String, nullable=False, default="legacy", server_default="legacy")

    # Alignment metadata
    left_eye_x = Column(Float, nullable=True)
    left_eye_y = Column(Float, nullable=True)
    right_eye_x = Column(Float, nullable=True)
    right_eye_y = Column(Float, nullable=True)
    face_detected = Column(Boolean, default=False)
    # False while an upload is staged and alignment hasn't run yet. Lets the UI
    # tell "waiting to be aligned" apart from "aligned, no face found".
    align_attempted = Column(Boolean, nullable=False, default=False, server_default="0")

    # Geometry belongs to this immutable original; a stored index never relies
    # on the order of a future detector run.
    face_candidates = Column(JSON, nullable=True)
    selected_face_index = Column(Integer, nullable=True)
    needs_face_selection = Column(Boolean, nullable=False, default=False, server_default="0")
    alignment_version = Column(String, nullable=False, default="", server_default="")

    deleted_at = Column(DateTime, nullable=True)

    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Whether to include in video generation
    included_in_video = Column(Boolean, default=True)

    # Manual sort order (lower = earlier in sequence). Null means use default sort.
    sort_order = Column(Integer, nullable=True, index=True)

    # File hash for duplicate detection (MD5 hash of original file content)
    file_hash = Column(String, nullable=True, index=True)


class FilterPreset(Base):
    """A saved filter look, shared by every person's timelapse (no profile_id)."""
    __tablename__ = "filter_presets"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(40), nullable=False, unique=True)
    definition = Column(JSON, nullable=False)  # FilterDefinition v1, validated on write
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
