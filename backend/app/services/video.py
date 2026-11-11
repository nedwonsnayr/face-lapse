"""Render the studio's paper-framed look into MP4 frames using Pillow/FFmpeg."""

import logging
import subprocess
import uuid
import time
from functools import lru_cache
from collections.abc import Callable
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from ..config import DEFAULT_FRAME_DURATION, VIDEOS_DIR
from .filters import FilterDefinition, apply_filter

log = logging.getLogger("face-lapse.video")

EXPORT_WIDTH = 1200
EXPORT_HEIGHT = 1800
PAPER = (255, 253, 249)
MAT = (20, 19, 17)
INK = (28, 26, 23)
ACCENT = (164, 55, 42)
_FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"


def _tracked_text(draw: ImageDraw.ImageDraw, text: str, y: int, font, tracking: int = 3) -> None:
    width = sum(draw.textlength(char, font=font) for char in text) + tracking * (len(text) - 1)
    x = (EXPORT_WIDTH - width) / 2
    for char in text:
        draw.text((x, y), char, font=font, fill=ACCENT, anchor="lt")
        x += draw.textlength(char, font=font) + tracking


@lru_cache(maxsize=1)
def _background() -> Image.Image:
    canvas = Image.new("RGBA", (EXPORT_WIDTH, EXPORT_HEIGHT), PAPER + (255,))
    shadow = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(shadow).rounded_rectangle((60, 60, 1140, 1500), radius=8, fill=(0, 0, 0, 40))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((60, 48, 1140, 1488), radius=8, fill=MAT)

    return canvas


@lru_cache(maxsize=2)
def _font(name: str, size: int):
    return ImageFont.truetype(str(_FONT_DIR / name), size)


def render_video_frame(
    image_path: str, date_label: str | None = None, age: int | None = None,
    photo_filter: FilterDefinition | None = None, frame_index: int = 0,
) -> Image.Image:
    """Compose the photo and optional independent captions; never edit the source.

    The filter applies to the photo only, never to the mat, paper or captions.
    """
    canvas = _background().copy()

    with Image.open(image_path) as source:
        photo = ImageOps.contain(source.convert("RGB"), (1024, 1384), Image.Resampling.LANCZOS)
    photo = apply_filter(photo, photo_filter, frame_index)
    canvas.paste(photo, (60 + (1080 - photo.width) // 2, 48 + (1440 - photo.height) // 2))
    draw = ImageDraw.Draw(canvas)
    if date_label:
        font = _font("Fraunces-Italic.ttf", 56)
        draw.text((EXPORT_WIDTH // 2, 1530), date_label, font=font, fill=INK, anchor="mt")
    if age is not None:
        font = _font("Inter-SemiBold.ttf", 26)
        _tracked_text(draw, f"AGE {age}", 1614 if date_label else 1548, font)
    return canvas.convert("RGB")


def generate_video(
    image_metadata: list[dict[str, Any]],
    frame_duration: float = DEFAULT_FRAME_DURATION,
    show_dates: bool = False,
    show_age: bool = False,
    on_progress: Callable[[str, int, int], None] | None = None,
    photo_filter: FilterDefinition | None = None,
) -> str | None:
    """Compose uniform styled frames, then encode at the selected playback speed."""
    if not image_metadata:
        return None
    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    # Each job keeps its own immutable result, including different caption settings.
    output_path = VIDEOS_DIR / f"timelapse_{uuid.uuid4().hex}.mp4"
    completed = False
    try:
        with TemporaryDirectory(prefix="face-lapse-video-") as temp:
            started = time.perf_counter()
            if on_progress:
                on_progress("rendering", 0, len(image_metadata))
            for index, metadata in enumerate(image_metadata):
                taken = metadata.get("date")
                label = f"{taken:%B} {taken.day}, {taken.year}" if show_dates and taken else None
                age = metadata.get("age") if show_age else None
                frame = render_video_frame(metadata["path"], label, age, photo_filter, index)
                frame.save(Path(temp) / f"frame_{index:06d}.jpg", quality=95, subsampling=0)
                frame.close()
                if on_progress:
                    on_progress("rendering", index + 1, len(image_metadata))

            rendered = time.perf_counter()
            log.info("Export rendered %d frames in %.2fs", len(image_metadata), rendered - started)
            if on_progress:
                on_progress("encoding", len(image_metadata), len(image_metadata))

            # Explicit rational cadence avoids concat-demuxer 25fps quantization
            # and the extra repeated last frame used by the previous exporter.
            rate = 1 / Fraction(str(frame_duration))
            command = [
                "ffmpeg", "-y", "-framerate", f"{rate.numerator}/{rate.denominator}",
                "-start_number", "0", "-i", str(Path(temp) / "frame_%06d.jpg"),
                "-c:v", "libx264", "-preset", "medium", "-crf", "23",
                "-pix_fmt", "yuv420p", "-movflags", "+faststart", str(output_path),
            ]
            result = subprocess.run(command, capture_output=True, text=True, timeout=600)
            log.info("Export encoding finished in %.2fs", time.perf_counter() - rendered)
            if result.returncode != 0:
                log.error("FFmpeg failed (exit %d): %s", result.returncode, result.stderr[-2000:])
                return None
        completed = True
        return str(output_path)
    except subprocess.TimeoutExpired:
        log.error("FFmpeg timed out after 600s")
        return None
    except (OSError, ValueError):
        log.exception("Could not render or encode the styled video")
        return None
    finally:
        if not completed:
            output_path.unlink(missing_ok=True)
