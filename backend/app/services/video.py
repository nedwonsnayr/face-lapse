"""Video generation service using FFmpeg."""

import logging
import subprocess
from datetime import datetime
from pathlib import Path
from tempfile import NamedTemporaryFile, TemporaryDirectory
from typing import Any

from PIL import Image, ImageDraw, ImageFont

from ..config import DEFAULT_FRAME_DURATION, OUTPUT_HEIGHT, OUTPUT_WIDTH, VIDEOS_DIR

log = logging.getLogger("face-lapse.video")

# macOS first, then Linux (Docker image installs fonts-dejavu-core).
_FONT_CANDIDATES = (
    "/System/Library/Fonts/Helvetica.ttc",
    "/Library/Fonts/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
)


def _load_font(size: int):
    for path in _FONT_CANDIDATES:
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default(size)


def _overlay_date_on_image(image_path: str, date_str: str, output_path: str, age: int | None = None) -> bool:
    """
    Overlay date text (and optionally age) on an image using PIL.
    Returns True on success, False on failure.
    """
    try:
        with Image.open(image_path) as source:
            img = source.convert("RGB")

        target_size = (OUTPUT_WIDTH, OUTPUT_HEIGHT)
        if img.size != target_size:
            img = img.resize(target_size, Image.Resampling.LANCZOS)

        draw = ImageDraw.Draw(img)

        font_size = max(12, round(img.height * 0.015))
        box_padding = max(5, round(img.height * 0.00625))
        margin = max(10, round(img.height * 0.0125))
        spacing = max(4, round(img.height * 0.005))

        font = _load_font(font_size)

        img_width, img_height = img.size
        bbox = draw.textbbox((0, 0), date_str, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        age_str = None
        age_text_width = 0
        age_text_height = 0
        if age is not None:
            age_str = f"Age: {age}"
            age_bbox = draw.textbbox((0, 0), age_str, font=font)
            age_text_width = age_bbox[2] - age_bbox[0]
            age_text_height = age_bbox[3] - age_bbox[1]

        spacing = spacing if age is not None else 0
        total_text_height = text_height + spacing + age_text_height

        box_width = max(text_width, age_text_width) + (box_padding * 2)
        box_height = total_text_height + (box_padding * 2)

        box_x = img_width - box_width - margin
        box_y = img_height - box_height - margin

        date_x = box_x + box_padding
        date_y = box_y + box_padding

        box_coords = [
            box_x,
            box_y,
            box_x + box_width,
            box_y + box_height,
        ]
        overlay = Image.new("RGBA", img.size, (0, 0, 0, 0))
        overlay_draw = ImageDraw.Draw(overlay)
        overlay_draw.rectangle(box_coords, fill=(0, 0, 0, 153))
        img = Image.alpha_composite(img.convert("RGBA"), overlay).convert("RGB")
        draw = ImageDraw.Draw(img)

        draw.text((date_x, date_y), date_str, fill=(255, 255, 255), font=font)

        if age_str:
            age_y = date_y + text_height + spacing
            age_x = box_x + box_width - age_text_width - box_padding
            draw.text((age_x, age_y), age_str, fill=(255, 255, 255), font=font)

        img.save(output_path, "JPEG", quality=95)
        return True
    except Exception as e:
        log.error("Failed to overlay date on image %s: %s", image_path, e)
        return False


def generate_video(
    image_metadata: list[dict[str, Any]],
    frame_duration: float = DEFAULT_FRAME_DURATION,
    show_dates: bool = False,
) -> str | None:
    """
    Generate an MP4 video from a list of image metadata.

    Uses FFmpeg concat demuxer for reliable frame timing.
    If show_dates is True, overlays dates on normalized frames using PIL.
    Returns the path to the generated video, or None on failure.
    """
    if not image_metadata:
        return None

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    # Name by speed and date overlay flag so regenerating with different options creates different files
    speed_label = f"{frame_duration:.2f}s"
    dates_suffix = "_dates" if show_dates else ""
    output_path = VIDEOS_DIR / f"timelapse_{speed_label}{dates_suffix}.mp4"

    # If show_dates is enabled, create temporary images with date overlays
    # Since FFmpeg's drawtext filter may not be available, we use PIL to pre-process images
    temp_dir = None
    temp_images = []  # Track temp images for cleanup
    if show_dates:
        temp_dir = TemporaryDirectory()
        temp_dir_path = Path(temp_dir.name)
        
        # Create images with date overlays
        for img_meta in image_metadata:
            original_path = img_meta["path"]
            date = img_meta.get("date")
            
            if date:
                if isinstance(date, datetime):
                    # Format as "January 15, 2024"
                    date_str = date.strftime("%B %d, %Y")
                else:
                    # Assume it's already a string
                    date_str = str(date)
            else:
                date_str = "No date"
            
            # Create temp image path
            temp_image_path = temp_dir_path / f"dated_{Path(original_path).name}"
            
            # Overlay date on image
            age = img_meta.get("age")
            if _overlay_date_on_image(original_path, date_str, str(temp_image_path), age):
                # Update the path to use the temp image
                img_meta["path"] = str(temp_image_path)
                temp_images.append(temp_image_path)
            else:
                # If overlay failed, use original image
                log.warning("Failed to overlay date on %s, using original", original_path)

    # Create a concat file listing each image with its duration
    # FFmpeg concat demuxer format:
    #   file '/path/to/image.jpg'
    #   duration 0.1
    # NOTE: This must be created AFTER date overlays so it uses the updated paths
    with NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        concat_path = f.name
        for img_meta in image_metadata:
            img_path = img_meta["path"]
            f.write(f"file '{img_path}'\n")
            f.write(f"duration {frame_duration}\n")
        # Repeat last image to avoid it being shown for 0 duration
        if image_metadata:
            f.write(f"file '{image_metadata[-1]['path']}'\n")

    try:
        vf = f"scale={OUTPUT_WIDTH}:{OUTPUT_HEIGHT}:flags=lanczos,format=yuv420p"

        cmd = [
            "ffmpeg",
            "-y",  # overwrite output
            "-f", "concat",
            "-safe", "0",
            "-i", concat_path,
            "-vf", vf,
            "-c:v", "libx264",
            "-preset", "medium",
            "-crf", "23",
            "-movflags", "+faststart",
            str(output_path),
        ]

        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            timeout=600,  # 10 minute timeout for large sets
        )

        if result.returncode != 0:
            error_msg = result.stderr if result.stderr else result.stdout
            full_error = error_msg[-2000:] if error_msg else "No error output"
            log.error("FFmpeg failed (exit %d):\nSTDERR:\n%s\nSTDOUT:\n%s", 
                     result.returncode, 
                     result.stderr[-2000:] if result.stderr else "None",
                     result.stdout[-2000:] if result.stdout else "None")
            # Also log the command for debugging
            log.error("FFmpeg command: %s", " ".join(cmd))
            return None

        return str(output_path)

    except subprocess.TimeoutExpired:
        log.error("FFmpeg timed out after 600s")
        return None
    except FileNotFoundError:
        log.error("FFmpeg not found — install with: brew install ffmpeg")
        return None
    finally:
        # Clean up temp files
        Path(concat_path).unlink(missing_ok=True)
        # Clean up temporary directory with date-overlaid images
        if temp_dir:
            try:
                temp_dir.cleanup()
            except Exception as e:
                log.warning("Failed to cleanup temp directory: %s", e)
