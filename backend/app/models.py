from datetime import datetime
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean
from .database import Base


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    original_filename = Column(String, nullable=False)  # Integer-based name (e.g. "43.heic")
    source_filename = Column(String, nullable=True)      # Phone's original name (e.g. "IMG_0733.HEIC")
    original_path = Column(String, nullable=False)
    aligned_path = Column(String, nullable=True)

    # EXIF or derived date for chronological sorting
    photo_taken_at = Column(DateTime, nullable=True)

    # Alignment metadata
    left_eye_x = Column(Float, nullable=True)
    left_eye_y = Column(Float, nullable=True)
    right_eye_x = Column(Float, nullable=True)
    right_eye_y = Column(Float, nullable=True)
    face_detected = Column(Boolean, default=False)

    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Whether to include in video generation
    included_in_video = Column(Boolean, default=True)

    # Manual sort order (lower = earlier in sequence). Null means use default sort.
    sort_order = Column(Integer, nullable=True, index=True)
