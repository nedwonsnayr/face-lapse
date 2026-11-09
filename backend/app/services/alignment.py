"""Face alignment service using MediaPipe Face Mesh and OpenCV."""

import logging
import os
import tempfile
import math
import re
from dataclasses import dataclass, field
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
    faces: list[dict] = field(default_factory=list)
    needs_face_selection: bool = False


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
    Run MediaPipe Face Mesh on an RGB image. Return one landmark list per face.
    """
    mp_face_mesh = mp.solutions.face_mesh
    with mp_face_mesh.FaceMesh(
        static_image_mode=True,
        max_num_faces=10,
        refine_landmarks=True,
        min_detection_confidence=min_confidence,
    ) as face_mesh:
        results = face_mesh.process(rgb)

    if results.multi_face_landmarks:
        return [face.landmark for face in results.multi_face_landmarks]
    return []


def detect_faces(input_path: str) -> list[dict]:
    """Normalized geometry in the EXIF-oriented original; sorted left to right."""
    img = _load_image_with_exif(input_path)
    if img is None:
        return []
    return _faces_in_image(img)


def _faces_in_image(img: np.ndarray) -> list[dict]:
    h, w = img.shape[:2]
    rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
    landmarks = _detect_face_landmarks(rgb)
    if not landmarks and max(w, h) > _MAX_DETECT_DIM:
        scale = _MAX_DETECT_DIM / max(w, h)
        small = cv2.resize(rgb, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        landmarks = _detect_face_landmarks(small, min_confidence=0.2)
    faces = _landmarks_to_faces(landmarks)
    if not faces:
        faces = _search_crops(rgb)
    return sorted(faces, key=lambda face: (face["bounds"]["x"], face["bounds"]["y"]))


def _landmarks_to_faces(landmarks) -> list[dict]:
    faces = []
    for points in landmarks:
        x0 = max(0.0, min(p.x for p in points))
        y0 = max(0.0, min(p.y for p in points))
        x1 = min(1.0, max(p.x for p in points))
        y1 = min(1.0, max(p.y for p in points))
        if x1 <= x0 or y1 <= y0:
            continue
        left_eye = list(_get_eye_center(points, LEFT_EYE_INDICES, 1, 1))
        right_eye = list(_get_eye_center(points, RIGHT_EYE_INDICES, 1, 1))
        # A clipped face whose eyes fall outside the crop cannot be aligned.
        if not all(0 <= value <= 1 for value in left_eye + right_eye):
            continue
        faces.append({
            "bounds": {"x": x0, "y": y0, "width": x1 - x0, "height": y1 - y0},
            "left_eye": left_eye,
            "right_eye": right_eye,
        })
    return faces


def _same_face(a: dict, b: dict, width: int, height: int) -> bool:
    """Merge repeated detections from overlapping crops, not nearby people."""
    box_a, box_b = a["bounds"], b["bounds"]
    overlap_w = max(0.0, min(box_a["x"] + box_a["width"], box_b["x"] + box_b["width"]) - max(box_a["x"], box_b["x"]))
    overlap_h = max(0.0, min(box_a["y"] + box_a["height"], box_b["y"] + box_b["height"]) - max(box_a["y"], box_b["y"]))
    intersection = overlap_w * overlap_h
    union = box_a["width"] * box_a["height"] + box_b["width"] * box_b["height"] - intersection
    if union > 0 and intersection / union > 0.4:
        return True

    def eyes(face):
        left = (face["left_eye"][0] * width, face["left_eye"][1] * height)
        right = (face["right_eye"][0] * width, face["right_eye"][1] * height)
        return ((left[0] + right[0]) / 2, (left[1] + right[1]) / 2), math.dist(left, right)

    center_a, spacing_a = eyes(a)
    center_b, spacing_b = eyes(b)
    return math.dist(center_a, center_b) < 0.5 * min(spacing_a, spacing_b)


def _search_crops(rgb: np.ndarray) -> list[dict]:
    """Bounded 2x enlargement search; all geometry stays in original coordinates."""
    height, width = rgb.shape[:2]
    if min(height, width) < 64:
        return []
    crop_w, crop_h = width // 2, height // 2
    xs = (0, (width - crop_w) // 2, width - crop_w)
    ys = (0, (height - crop_h) // 2, height - crop_h)
    # Center first keeps good, complete detections ahead of edge-clipped copies.
    positions = [(xs[1], ys[1])] + [(x, y) for y in ys for x in xs if (x, y) != (xs[1], ys[1])]
    faces = []
    for x, y in positions:
        crop = rgb[y:y + crop_h, x:x + crop_w]
        if max(crop_w, crop_h) > 1024:
            scale = 1024 / max(crop_w, crop_h)
            crop = cv2.resize(crop, None, fx=scale, fy=scale, interpolation=cv2.INTER_AREA)
        for face in _landmarks_to_faces(_detect_face_landmarks(crop)):
            box = face["bounds"]
            mapped = {
                "bounds": {"x": (x + box["x"] * crop_w) / width,
                           "y": (y + box["y"] * crop_h) / height,
                           "width": box["width"] * crop_w / width,
                           "height": box["height"] * crop_h / height},
                "left_eye": [(x + face["left_eye"][0] * crop_w) / width,
                             (y + face["left_eye"][1] * crop_h) / height],
                "right_eye": [(x + face["right_eye"][0] * crop_w) / width,
                              (y + face["right_eye"][1] * crop_h) / height],
            }
            if not any(_same_face(mapped, previous, width, height) for previous in faces):
                faces.append(mapped)
                if len(faces) == 10:
                    return faces
    return faces


def align_image(input_path: str, output_path: str, selected_face: dict | None = None) -> AlignmentResult:
    """Align a stored choice, or auto-align only when detection finds one face."""
    img = _load_image_with_exif(input_path)
    if img is None:
        return AlignmentResult(success=False, error="Could not read image file")
    h, w = img.shape[:2]
    faces = [] if selected_face is not None else _faces_in_image(img)
    if selected_face is None:
        if not faces:
            return AlignmentResult(success=False, error="No face detected")
        if len(faces) > 1:
            return AlignmentResult(success=False, faces=faces, needs_face_selection=True)
        selected_face = faces[0]
    left_eye = (selected_face["left_eye"][0] * w, selected_face["left_eye"][1] * h)
    right_eye = (selected_face["right_eye"][0] * w, selected_face["right_eye"][1] * h)

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
    fd, temp_path = tempfile.mkstemp(suffix=".jpg", dir=Path(output_path).parent)
    os.close(fd)
    try:
        if not cv2.imwrite(temp_path, aligned, [cv2.IMWRITE_JPEG_QUALITY, 95]):
            return AlignmentResult(success=False, error="Could not save aligned image")
        os.replace(temp_path, output_path)
    finally:
        Path(temp_path).unlink(missing_ok=True)

    return AlignmentResult(
        success=True,
        aligned_path=output_path,
        left_eye=left_eye,
        right_eye=right_eye,
        faces=faces,
    )
