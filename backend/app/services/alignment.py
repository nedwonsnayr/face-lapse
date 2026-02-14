"""Face alignment service using MediaPipe Face Mesh and OpenCV."""

import logging
import math
import re
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

import cv2
import mediapipe as mp
import numpy as np
from PIL import Image as PILImage, ImageOps
from PIL.ExifTags import Base as ExifBase
from pillow_heif import register_heif_opener

# Register HEIC/HEIF support so PIL can open iPhone photos
register_heif_opener()

from ..config import (
    OUTPUT_WIDTH,
    OUTPUT_HEIGHT,
    TARGET_EYE_DISTANCE,
    TARGET_LEFT_EYE,
    TARGET_RIGHT_EYE,
)

log = logging.getLogger("face-lapse.alignment")

# MediaPipe Face Mesh landmark indices for eye regions
LEFT_EYE_INDICES = [33, 133, 159, 145]
RIGHT_EYE_INDICES = [362, 263, 386, 374]

# Max dimension before we downscale for detection (MediaPipe works best ≤2048px)
_MAX_DETECT_DIM = 2048


@dataclass
class AlignmentResult:
    success: bool
    aligned_path: str | None = None
    left_eye: tuple[float, float] | None = None
    right_eye: tuple[float, float] | None = None
    error: str | None = None


def extract_exif_date(image_path: str) -> str | None:
    """Extract DateTimeOriginal from EXIF data, return ISO string or None."""
    try:
        img = PILImage.open(image_path)
        exif_data = img.getexif()
        if exif_data:
            # Try IFD0 tags first
            date_str = exif_data.get(ExifBase.DateTimeOriginal) or exif_data.get(
                ExifBase.DateTime
            )
            # Also check EXIF sub-IFD (where DateTimeOriginal often lives)
            if not date_str:
                exif_ifd = exif_data.get_ifd(0x8769)
                if exif_ifd:
                    date_str = exif_ifd.get(36867) or exif_ifd.get(36868)  # DateTimeOriginal / DateTimeDigitized
            if date_str:
                # EXIF format: "2024:01:15 14:30:00" -> "2024-01-15T14:30:00"
                return date_str.replace(":", "-", 2).replace(" ", "T", 1)
    except Exception:
        pass
    return None


# Patterns for extracting dates from filenames, ordered by specificity
_FILENAME_DATE_PATTERNS = [
    # 2024-01-15 14.30.22 or 2024-01-15_143022
    re.compile(r"(\d{4})-(\d{2})-(\d{2})[_\s\-.](\d{2})[._]?(\d{2})[._]?(\d{2})"),
    # AirDrop: "2026-02-14 at 3.31.16 PM" (1- or 2-digit hour)
    re.compile(r"(\d{4})-(\d{2})-(\d{2})\s+at\s+(\d{1,2})\.(\d{2})\.(\d{2})"),
    # 20240115_143022 or 20240115-143022
    re.compile(r"(\d{4})(\d{2})(\d{2})[_\-](\d{2})(\d{2})(\d{2})"),
    # IMG_20240115_143022
    re.compile(r"IMG[_\-](\d{4})(\d{2})(\d{2})[_\-](\d{2})(\d{2})(\d{2})"),
    # 2024-01-15
    re.compile(r"(\d{4})-(\d{2})-(\d{2})"),
    # 20240115 (8 consecutive digits that look like a date)
    re.compile(r"(?<!\d)(\d{4})(\d{2})(\d{2})(?!\d)"),
    # IMG_1234 style -- no date, will return None
]


def parse_date_from_filename(filename: str) -> datetime | None:
    """
    Try to extract a date/datetime from a filename string.
    Returns a datetime object or None if no date pattern is found.
    """
    stem = Path(filename).stem

    for pattern in _FILENAME_DATE_PATTERNS:
        m = pattern.search(stem)
        if m:
            groups = m.groups()
            try:
                if len(groups) >= 6:
                    return datetime(
                        int(groups[0]), int(groups[1]), int(groups[2]),
                        int(groups[3]), int(groups[4]), int(groups[5]),
                    )
                elif len(groups) >= 3:
                    return datetime(int(groups[0]), int(groups[1]), int(groups[2]))
            except ValueError:
                continue  # invalid date values, try next pattern
    return None


def _get_eye_center(landmarks, indices: list[int], w: int, h: int) -> tuple[float, float]:
    """Average the specified landmark positions to get an eye center."""
    xs = [landmarks[i].x * w for i in indices]
    ys = [landmarks[i].y * h for i in indices]
    return (sum(xs) / len(xs), sum(ys) / len(ys))


def _load_image_with_exif(input_path: str) -> np.ndarray | None:
    """
    Load an image using PIL (handles HEIC, EXIF rotation, etc.)
    and return as a BGR numpy array suitable for OpenCV.
    """
    try:
        pil_img = PILImage.open(input_path)
        # Apply EXIF orientation (rotates/flips so the image is display-correct)
        pil_img = ImageOps.exif_transpose(pil_img)
        # Convert to RGB if needed (handles RGBA, palette, grayscale, etc.)
        pil_img = pil_img.convert("RGB")
        arr = np.array(pil_img)
        # PIL gives RGB, OpenCV wants BGR
        return cv2.cvtColor(arr, cv2.COLOR_RGB2BGR)
    except Exception as e:
        log.warning("PIL load failed for %s: %s, falling back to cv2", input_path, e)
        return cv2.imread(input_path)


def _detect_face_landmarks(rgb: np.ndarray, min_confidence: float = 0.3):
    """
    Run MediaPipe Face Mesh on an RGB image. Returns landmarks or None.
    """
    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=1,
        refine_landmarks=True,
        min_detection_confidence=min_confidence,
    ) as face_mesh:
        results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        return results.multi_face_landmarks[0].landmark
    return None


def align_image(input_path: str, output_path: str) -> AlignmentResult:
    """
    Detect face landmarks, compute affine transform, and save aligned image.

    Pipeline:
    1. Load image with EXIF rotation applied (fixes sideways iPhone photos).
    2. Attempt face detection at original resolution (confidence 0.3).
    3. If that fails and image is large, retry on a downscaled copy.
    4. Map detected landmarks back to original coordinates, align, and save.
    """
    # Step 1: Load with EXIF rotation
    img = _load_image_with_exif(input_path)
    if img is None:
        return AlignmentResult(success=False, error="Could not read image file")

    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)

    # Step 2: Detect at original resolution
    landmarks = _detect_face_landmarks(rgb, min_confidence=0.3)
    detect_scale = 1.0

    # Step 3: If failed and image is large, retry on a downscaled copy
    if landmarks is None and max(w, h) > _MAX_DETECT_DIM:
        detect_scale = _MAX_DETECT_DIM / max(w, h)
        small_rgb = cv2.resize(rgb, None, fx=detect_scale, fy=detect_scale, interpolation=cv2.INTER_AREA)
        landmarks = _detect_face_landmarks(small_rgb, min_confidence=0.2)
        if landmarks:
            log.info("    face found after downscale to %dx%d", small_rgb.shape[1], small_rgb.shape[0])

    if landmarks is None:
        return AlignmentResult(success=False, error="No face detected")

    # Step 4: Map landmark coords back to original image space
    lm_w = int(w * detect_scale)
    lm_h = int(h * detect_scale)
    left_eye = _get_eye_center(landmarks, LEFT_EYE_INDICES, lm_w, lm_h)
    right_eye = _get_eye_center(landmarks, RIGHT_EYE_INDICES, lm_w, lm_h)

    # Scale back to original resolution if we downscaled for detection
    if detect_scale != 1.0:
        left_eye = (left_eye[0] / detect_scale, left_eye[1] / detect_scale)
        right_eye = (right_eye[0] / detect_scale, right_eye[1] / detect_scale)

    # Compute the affine transform
    dx = right_eye[0] - left_eye[0]
    dy = right_eye[1] - left_eye[1]
    angle = math.degrees(math.atan2(dy, dx))

    current_dist = math.sqrt(dx * dx + dy * dy)
    if current_dist < 1:
        return AlignmentResult(success=False, error="Eyes too close together")

    scale = TARGET_EYE_DISTANCE / current_dist

    eye_mid = ((left_eye[0] + right_eye[0]) / 2, (left_eye[1] + right_eye[1]) / 2)
    target_mid = (
        (TARGET_LEFT_EYE[0] + TARGET_RIGHT_EYE[0]) / 2,
        (TARGET_LEFT_EYE[1] + TARGET_RIGHT_EYE[1]) / 2,
    )

    M = cv2.getRotationMatrix2D(eye_mid, angle, scale)
    M[0, 2] += target_mid[0] - eye_mid[0]
    M[1, 2] += target_mid[1] - eye_mid[1]

    aligned = cv2.warpAffine(
        img,
        M,
        (OUTPUT_WIDTH, OUTPUT_HEIGHT),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=(0, 0, 0),
    )

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    cv2.imwrite(output_path, aligned, [cv2.IMWRITE_JPEG_QUALITY, 95])

    return AlignmentResult(
        success=True,
        aligned_path=output_path,
        left_eye=left_eye,
        right_eye=right_eye,
    )
