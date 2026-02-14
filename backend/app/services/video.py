"""Video generation service using FFmpeg."""

import logging
import subprocess
import uuid
from pathlib import Path
from tempfile import NamedTemporaryFile

from ..config import VIDEOS_DIR, DEFAULT_FRAME_DURATION

log = logging.getLogger("face-lapse.video")


def generate_video(
    aligned_image_paths: list[str],
    frame_duration: float = DEFAULT_FRAME_DURATION,
) -> str | None:
    """
    Generate an MP4 video from a list of aligned image paths.

    Uses FFmpeg concat demuxer for reliable frame timing.
    Returns the path to the generated video, or None on failure.
    """
    if not aligned_image_paths:
        return None

    VIDEOS_DIR.mkdir(parents=True, exist_ok=True)
    output_path = VIDEOS_DIR / f"timelapse_{uuid.uuid4().hex}.mp4"

    # Create a concat file listing each image with its duration
    # FFmpeg concat demuxer format:
    #   file '/path/to/image.jpg'
    #   duration 0.1
    with NamedTemporaryFile(mode="w", suffix=".txt", delete=False) as f:
        concat_path = f.name
        for img_path in aligned_image_paths:
            f.write(f"file '{img_path}'\n")
            f.write(f"duration {frame_duration}\n")
        # Repeat last image to avoid it being shown for 0 duration
        if aligned_image_paths:
            f.write(f"file '{aligned_image_paths[-1]}'\n")

    try:
        cmd = [
            "ffmpeg",
            "-y",  # overwrite output
            "-f", "concat",
            "-safe", "0",
            "-i", concat_path,
            "-vf", "format=yuv420p",
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
            log.error("FFmpeg failed (exit %d): %s", result.returncode, result.stderr[-500:] if result.stderr else "")
            return None

        return str(output_path)

    except subprocess.TimeoutExpired:
        log.error("FFmpeg timed out after 600s")
        return None
    except FileNotFoundError:
        log.error("FFmpeg not found — install with: brew install ffmpeg")
        return None
    finally:
        # Clean up concat file
        Path(concat_path).unlink(missing_ok=True)
