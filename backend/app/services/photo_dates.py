"""Calendar dates have provenance; missing metadata must not invent capture dates."""
import re
from datetime import datetime, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from fastapi import HTTPException


def upload_zone(name: str) -> ZoneInfo:
    try:
        return ZoneInfo(name)
    except (ValueError, ZoneInfoNotFoundError):
        raise HTTPException(status_code=422, detail="Unknown timezone") from None


def local_upload_time(uploaded_at: datetime, zone: ZoneInfo) -> datetime:
    # SQLite stores our created_at UTC timestamps without a timezone suffix.
    instant = uploaded_at if uploaded_at.tzinfo else uploaded_at.replace(tzinfo=timezone.utc)
    return instant.astimezone(zone).replace(tzinfo=None)


def webcam_date(filename: str, zone: ZoneInfo) -> datetime | None:
    """Our camera filenames encode the complete capture instant in UTC."""
    match = re.fullmatch(r"webcam-(\d{4}-\d{2}-\d{2})T(\d{2})-(\d{2})-(\d{2})-(\d{3})Z\.jpg", filename)
    if not match:
        return None
    day, hour, minute, second, millis = match.groups()
    try:
        instant = datetime.fromisoformat(f"{day}T{hour}:{minute}:{second}.{millis}+00:00")
        return local_upload_time(instant, zone)
    except ValueError:
        return None
