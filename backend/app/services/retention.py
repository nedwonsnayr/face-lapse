"""Delete exported videos after a retention period. They are regenerated on demand."""
import asyncio
import logging
import os
import stat
import time
from pathlib import Path
from typing import Callable, Collection

log = logging.getLogger("face-lapse.retention")

SWEEP_INTERVAL_SECONDS = 3600


def sweep_videos(videos_dir: Path, retention_days: float, protected: Collection[str] = (),
                 now: float | None = None) -> int:
    """Delete `*.mp4` files directly inside videos_dir whose mtime is older than retention_days.

    Never deletes names in `protected`, symlinks, subdirectories or non-MP4 files, and never
    looks outside videos_dir. Returns how many files were deleted; a missing dir deletes none.
    """
    if retention_days <= 0:
        return 0
    cutoff = (time.time() if now is None else now) - retention_days * 86400
    try:
        entries = list(os.scandir(videos_dir))
    except OSError:
        return 0
    deleted = 0
    for entry in entries:
        if not entry.name.endswith(".mp4") or entry.name in protected:
            continue
        try:
            info = entry.stat(follow_symlinks=False)  # lstat: a symlink is never a regular file here
            if not stat.S_ISREG(info.st_mode) or info.st_mtime >= cutoff:
                continue
            os.unlink(entry.path)
            deleted += 1
        except OSError:
            log.warning("Could not delete expired video %s", entry.name)
    return deleted


async def retention_loop(sweep: Callable[[], int], interval: float = SWEEP_INTERVAL_SECONDS) -> None:
    """Run `sweep` now and then every `interval` seconds, off the event loop. Never raises."""
    while True:
        try:
            deleted = await asyncio.to_thread(sweep)
            if deleted:
                log.info("Deleted %d expired exported video(s)", deleted)
        except asyncio.CancelledError:
            raise
        except Exception:
            log.exception("Video retention sweep failed")
        await asyncio.sleep(interval)
