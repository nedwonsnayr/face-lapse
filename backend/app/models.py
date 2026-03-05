from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Float, DateTime, Boolean, ForeignKey
from sqlalchemy.orm import relationship
from .database import Base

def _utcnow():
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    github_id = Column(Integer, unique=True, nullable=True, index=True)  # GitHub user ID
    github_username = Column(String, nullable=True)
    github_email = Column(String, nullable=True)
    github_avatar_url = Column(String, nullable=True)
    access_token = Column(String, nullable=True)  # Encrypted GitHub access token
    
    # Timestamps
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)
    
    # Relationship
    images = relationship("Image", back_populates="user", cascade="all, delete-orphan")


class Image(Base):
    __tablename__ = "images"

    id = Column(Integer, primary_key=True, index=True, autoincrement=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True, default=1)
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
    created_at = Column(DateTime, default=_utcnow)
    updated_at = Column(DateTime, default=_utcnow, onupdate=_utcnow)

    # Whether to include in video generation
    included_in_video = Column(Boolean, default=True)

    # Manual sort order (lower = earlier in sequence). Null means use default sort.
    sort_order = Column(Integer, nullable=True, index=True)

    # File hash for duplicate detection (MD5 hash of original file content)
    file_hash = Column(String, nullable=True, index=True)
    
    # Relationship
    user = relationship("User", back_populates="images")