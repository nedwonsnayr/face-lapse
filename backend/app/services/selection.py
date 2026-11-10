"""Deterministic calendar sampling shared by export admission tests."""
from datetime import timedelta


def select_frames(images, date_from=None, date_to=None, sampling='all'):
    filtered = [p for p in images if
        (not date_from or (p.photo_taken_at and p.photo_taken_at.date() >= date_from)) and
        (not date_to or (p.photo_taken_at and p.photo_taken_at.date() <= date_to))]
    if sampling == 'all':
        return filtered
    chosen = set()
    seen = set()
    for photo in sorted(filtered, key=lambda p: (p.photo_taken_at.isoformat() if p.photo_taken_at else '', p.id)):
        if not photo.photo_taken_at:
            chosen.add(photo.id)
            continue
        day = photo.photo_taken_at.date()
        if sampling == 'week':
            key = (day - timedelta(days=day.weekday())).isoformat()
        elif sampling == 'month':
            key = day.isoformat()[:7]
        else:
            key = day.isoformat()
        if key not in seen:
            seen.add(key)
            chosen.add(photo.id)
    return [p for p in filtered if p.id in chosen]
