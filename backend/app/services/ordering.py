"""The one order photos are shown and played in.

Photos run oldest to newest by when they were taken (upload time if unknown).
Dragging a photo in the library saves a position (`sort_order`) for every
photo, which then wins. Photos without a saved position (anything uploaded
since the last drag) are merged in by date, so an old photo uploaded today
lands in its year rather than at the end.

Used by the image list (library and timelapse player) and video generation,
so all three always agree.
"""

from datetime import datetime

from ..config import numeric_filename_key


def _taken(img) -> datetime:
    return img.photo_taken_at or img.created_at or datetime.max


def library_order(images: list) -> list:
    by_date = lambda img: (_taken(img), numeric_filename_key(img.original_filename), img.id)  # noqa: E731
    placed = sorted((i for i in images if i.sort_order is not None), key=lambda i: (i.sort_order, by_date(i)))
    loose = sorted((i for i in images if i.sort_order is None), key=by_date)

    # Merge: each loose photo goes before the first placed photo taken after it.
    out, p = [], 0
    for img in loose:
        while p < len(placed) and _taken(placed[p]) <= _taken(img):
            out.append(placed[p])
            p += 1
        out.append(img)
    out.extend(placed[p:])
    return out
