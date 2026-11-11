"""Timelapse filters: validation and the numpy export pipeline.

The pipeline is normative in .10x/specs/2026-11-10-timelapse-filters-design.md
("Pipeline", steps 1-11). frontend/src/filters/FilterRenderer.ts implements the
same steps in GLSL; e2e/tests/filter-parity.spec.ts keeps them within 2/255.
"""

from __future__ import annotations

import math
from functools import lru_cache
from typing import Literal

import numpy as np
from PIL import Image
from pydantic import BaseModel, ConfigDict, Field


class _Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Tint(_Strict):
    color: str = Field(pattern=r"^#[0-9a-fA-F]{6}$")
    blend: Literal["soft-light", "overlay", "multiply", "screen"]
    strength: float = Field(ge=0, le=1)


class Vignette(_Strict):
    strength: float = Field(ge=0, le=1)
    size: float = Field(ge=0, le=1)


class Grain(_Strict):
    amount: float = Field(ge=0, le=1)
    size: float = Field(ge=0, le=1)


class FilterDefinition(_Strict):
    version: Literal[1]
    brightness: float = Field(ge=0.5, le=1.5)
    contrast: float = Field(ge=0.5, le=1.5)
    saturation: float = Field(ge=0, le=2)
    grayscale: float = Field(ge=0, le=1)
    warmth: float = Field(ge=0, le=1)
    hue: float = Field(ge=-180, le=180)
    fade: float = Field(ge=0, le=1)
    tint: Tint
    vignette: Vignette
    grain: Grain

    def is_identity(self) -> bool:
        return (
            self.brightness == 1 and self.contrast == 1 and self.saturation == 1 and self.grayscale == 0
            and self.warmth == 0 and self.hue == 0 and self.fade == 0 and self.tint.strength == 0
            and self.vignette.strength == 0 and self.grain.amount == 0
        )


def canonical_filter(definition: FilterDefinition | None) -> dict | None:
    """Stable form for cache keys and storage; identity means "no filter"."""
    if definition is None or definition.is_identity():
        return None

    def clean(value):
        if isinstance(value, dict):
            return {key: clean(item) for key, item in sorted(value.items())}
        if isinstance(value, float):
            return round(value, 4)
        if isinstance(value, str) and value.startswith("#"):
            return value.lower()
        return value

    return clean(definition.model_dump())


# ── Pipeline ─────────────────────────────────────────────────────

def _saturate(s: float) -> np.ndarray:
    return np.array([
        [.213 + .787 * s, .715 - .715 * s, .072 - .072 * s],
        [.213 - .213 * s, .715 + .285 * s, .072 - .072 * s],
        [.213 - .213 * s, .715 - .715 * s, .072 + .928 * s],
    ], dtype=np.float32)


def _grayscale(g: float) -> np.ndarray:
    a = 1 - g
    return np.array([
        [.2126 + .7874 * a, .7152 - .7152 * a, .0722 - .0722 * a],
        [.2126 - .2126 * a, .7152 + .2848 * a, .0722 - .0722 * a],
        [.2126 - .2126 * a, .7152 - .7152 * a, .0722 + .9278 * a],
    ], dtype=np.float32)


def _sepia(w: float) -> np.ndarray:
    a = 1 - w
    return np.array([
        [.393 + .607 * a, .769 - .769 * a, .189 - .189 * a],
        [.349 - .349 * a, .686 + .314 * a, .168 - .168 * a],
        [.272 - .272 * a, .534 - .534 * a, .131 + .869 * a],
    ], dtype=np.float32)


def _hue_rotate(degrees: float) -> np.ndarray:
    c, s = math.cos(math.radians(degrees)), math.sin(math.radians(degrees))
    return np.array([
        [.213 + .787 * c - .213 * s, .715 - .715 * c - .715 * s, .072 - .072 * c + .928 * s],
        [.213 - .213 * c + .143 * s, .715 + .285 * c + .140 * s, .072 - .072 * c - .283 * s],
        [.213 - .213 * c - .787 * s, .715 - .715 * c + .715 * s, .072 + .928 * c + .072 * s],
    ], dtype=np.float32)


def _blend(b: np.ndarray, s: float, mode: str) -> np.ndarray:
    """One contiguous channel `b` (backdrop) against constant source channel `s`."""
    if mode == "multiply":
        return b * np.float32(s)
    if mode == "screen":
        return b + np.float32(s) - b * np.float32(s)
    if mode == "overlay":
        return np.where(b <= .5, b * np.float32(2 * s), 1 - (1 - b) * np.float32(2 * (1 - s)))
    if s <= .5:
        return b - np.float32(1 - 2 * s) * b * (1 - b)
    d = np.where(b <= .25, ((16 * b - 12) * b + 4) * b, np.sqrt(b))
    return b + np.float32(2 * s - 1) * (d - b)


def _smoothstep(e0: float, e1: float, x: np.ndarray) -> np.ndarray:
    t = np.clip((x - e0) / (e1 - e0), 0, 1)
    return t * t * (3 - 2 * t)


def lowbias32(x: np.ndarray) -> np.ndarray:
    """Integer hash shared bit-for-bit with the shader (uint32 wraps)."""
    x = x.astype(np.uint32)
    x ^= x >> np.uint32(16)
    x *= np.uint32(0x7FEB352D)
    x ^= x >> np.uint32(15)
    x *= np.uint32(0x846CA68B)
    x ^= x >> np.uint32(16)
    return x


def grain_cells(size: float) -> int:
    # floor(v + .5) rather than round(): JS Math.round and Python round differ on halves.
    return int(math.floor(320 - 240 * size + 0.5))


@lru_cache(maxsize=4)
def _grain_index(width: int, height: int, cells: int) -> tuple[np.ndarray, np.ndarray]:
    cx = (np.arange(width, dtype=np.int64) * cells) // width
    cy = (np.arange(height, dtype=np.int64) * cells) // width
    return cx, cy


def grain_noise(width: int, height: int, cells: int, frame_index: int) -> np.ndarray:
    """Per-pixel noise in [-1, 1] (float32), exactly reproducible in GLSL.

    Hashes once per grain cell, then expands to pixels (same values as hashing per pixel).
    """
    cx, cy = _grain_index(width, height, cells)
    hf = lowbias32(np.array([frame_index & 0xFFFFFFFF], dtype=np.uint32))
    hy = lowbias32(np.arange(int(cy[-1]) + 1, dtype=np.uint32) + hf)
    seed = lowbias32(np.arange(int(cx[-1]) + 1, dtype=np.uint32)[None, :] + hy[:, None])
    cell = (seed >> np.uint32(8)).astype(np.float32) / np.float32(16777215) * np.float32(2) - np.float32(1)
    return cell[cy[:, None], cx[None, :]]


@lru_cache(maxsize=4)
def _vignette_mask(width: int, height: int, strength: float, size: float) -> np.ndarray:
    aspect = width / height
    px = (2 * (np.arange(width, dtype=np.float32) + .5) / width - 1) * np.float32(aspect)
    py = 2 * (np.arange(height, dtype=np.float32) + .5) / height - 1
    d = np.sqrt(px[None, :] ** 2 + py[:, None] ** 2) / np.float32(math.sqrt(aspect * aspect + 1))
    inner = .8 - .6 * size
    mask = (1 - np.float32(strength) * _smoothstep(inner, inner + .5, d).astype(np.float32))
    mask.flags.writeable = False
    return mask


def apply_filter_array(rgb: np.ndarray, f: FilterDefinition, frame_index: int = 0) -> np.ndarray:
    """uint8 HxWx3 in, uint8 HxWx3 out (spec steps 1-11).

    Works channel-planar (3xHxW) so per-channel and matrix steps stay contiguous.
    """
    h, w = rgb.shape[:2]
    c = np.ascontiguousarray(rgb.transpose(2, 0, 1), dtype=np.float32)
    c /= np.float32(255)

    def clamp(x: np.ndarray) -> np.ndarray:
        return np.clip(x, 0, 1, out=x)

    # A step at its identity value is exactly a no-op (its matrix is the identity
    # and input is already clamped), so skipping it changes nothing but time.
    if f.brightness != 1:  # 1
        c *= np.float32(f.brightness); clamp(c)
    if f.contrast != 1:  # 2
        c -= np.float32(.5); c *= np.float32(f.contrast); c += np.float32(.5); clamp(c)
    for active, matrix in ((f.saturation != 1, _saturate(f.saturation)), (f.grayscale != 0, _grayscale(f.grayscale)),
                           (f.warmth != 0, _sepia(f.warmth)), (f.hue != 0, _hue_rotate(f.hue))):  # 3-6
        if active:
            c = clamp((matrix @ c.reshape(3, -1)).reshape(3, h, w))
    if f.fade != 0:  # 7
        c *= np.float32(1 - .35 * f.fade); c += np.float32(.22 * f.fade); clamp(c)
    if f.tint.strength > 0:  # 8
        p = np.float32(f.tint.strength)
        for ch, offset in enumerate((1, 3, 5)):
            b = c[ch]
            b += (_blend(b, int(f.tint.color[offset:offset + 2], 16) / 255, f.tint.blend) - b) * p
        clamp(c)
    if f.vignette.strength > 0:  # 9
        c *= _vignette_mask(w, h, f.vignette.strength, f.vignette.size)
        clamp(c)
    if f.grain.amount > 0:  # 10
        c += grain_noise(w, h, grain_cells(f.grain.size), frame_index) * np.float32(f.grain.amount * .2)
        clamp(c)
    c *= np.float32(255); c += np.float32(.5)  # 11: values are >= .5, so truncation is floor
    return c.astype(np.uint8).transpose(1, 2, 0).copy()


def apply_filter(photo: Image.Image, definition: FilterDefinition | None, frame_index: int = 0) -> Image.Image:
    """Filter a photo (never the paper/captions); identity returns it untouched."""
    if definition is None or definition.is_identity():
        return photo
    return Image.fromarray(apply_filter_array(np.asarray(photo.convert("RGB")), definition, frame_index), "RGB")
