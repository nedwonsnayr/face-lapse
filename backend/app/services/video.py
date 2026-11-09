"""Render the studio's paper-framed look into MP4 frames using Pillow/FFmpeg."""

import logging
import subprocess
import uuid
from fractions import Fraction
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

from ..config import DEFAULT_FRAME_DURATION, VIDEOS_DIR

log = logging.getLogger("face-lapse.video")

EXPORT_WIDTH = 1200
EXPORT_HEIGHT = 1800
PAPER = (255, 253, 249)
MAT = (20, 19, 17)
INK = (28, 26, 23)
ACCENT = (164, 55, 42)
_FONT_DIR = Path(__file__).resolve().parents[1] / "assets" / "fonts"


def _tracked_text(draw: ImageDraw.ImageDraw, text: str, y: int, font, tracking: int = 4) -> None:
    width = sum(draw.textlength(char, font=font) for char in text) + tracking * (len(text) - 1)
    x = (EXPORT_WIDTH - width) / 2
    for char in text:
        draw.text((x, y), char, font=font, fill=ACCENT, anchor="lt")
        x += draw.textlength(char, font=font) + tracking


def render_video_frame(image_path: str, date_label: str | None = None, age: int | None = None) -> Image.Image:
    """Compose the photo and optional independent captions; never edit the source."""
    canvas = Image.new("RGBA", (EXPORT_WIDTH, EXPORT_HEIGHT), PAPER + (255,))
    shadow = Image.new("RGBA", canvas.size)
    ImageDraw.Draw(shadow).rounded_rectangle((60, 60, 1140, 1500), radius=8, fill=(0, 0, 0, 40))
    canvas = Image.alpha_composite(canvas, shadow.filter(ImageFilter.GaussianBlur(18)))
    draw = ImageDraw.Draw(canvas)
    draw.rounded_rectangle((60, 48, 1140, 1488), radius=8, fill=MAT)

    with Image.open(image_path) as source:
        photo = ImageOps.contain(source.convert("RGB"), (1024, 1384), Image.Resampling.LANCZOS)
    canvas.paste(photo, (60 + (1080 - photo.width) // 2, 48 + (1440 - photo.height) // 2))
    draw = ImageDraw.Draw(canvas)
    if date_label:
        font = ImageFont.truetype(str(_FONT_DIR / "Fraunces-Italic.ttf"), 64)
        draw.text((EXPORT_WIDTH // 2, 1530), date_label, font=font, fill=INK, anchor="mt")
    if age is not None:
        font = ImageFont.truetype(str(_FONT_DIR / "Inter-SemiBold.ttf"), 28)
        _tracked_text(draw, f"AGE {age}", 1620 if date_label else 1548, font)
    return canvas.convert("RGB")


def generate_video(
    image_metadata: list[dict[str, Any]],
    frame_duration: float = DEFAULT_FRAME_DURATION,
    show_dates: bool = False,
    show_age: bool = False,
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
            for index, metadata in enumerate(image_metadata):
                taken = metadata.get("date")
                label = f"{taken:%B} {taken.day}, {taken.year}" if show_dates and taken else None
                age = metadata.get("age") if show_age else None
                frame = render_video_frame(metadata["path"], label, age)
                frame.save(Path(temp) / f"frame_{index:06d}.jpg", quality=95, subsampling=0)
                frame.close()

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
