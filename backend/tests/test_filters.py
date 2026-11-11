"""Filter pipeline (spec steps 1-11) and definition validation."""
import time
import unittest

import numpy as np
from PIL import Image
from pydantic import ValidationError

from backend.app.services.filters import (
    FilterDefinition, apply_filter, apply_filter_array, canonical_filter, grain_cells, grain_noise, lowbias32,
)

IDENTITY = {
    "version": 1, "brightness": 1, "contrast": 1, "saturation": 1, "grayscale": 0, "warmth": 0, "hue": 0, "fade": 0,
    "tint": {"color": "#ffffff", "blend": "soft-light", "strength": 0},
    "vignette": {"strength": 0, "size": 0.5},
    "grain": {"amount": 0, "size": 0.5},
}


def definition(**changes) -> FilterDefinition:
    data = {**IDENTITY, **{k: v for k, v in changes.items() if k not in ("tint", "vignette", "grain")}}
    for group in ("tint", "vignette", "grain"):
        data[group] = {**IDENTITY[group], **changes.get(group, {})}
    return FilterDefinition.model_validate(data)


def pixel(rgb, **changes):
    out = apply_filter_array(np.array([[rgb]], dtype=np.uint8), definition(**changes))
    return tuple(int(v) for v in out[0, 0])


class FilterPipelineTests(unittest.TestCase):
    def setUp(self):
        self.photo = (np.random.default_rng(7).random((40, 30, 3)) * 255).astype(np.uint8)

    def test_identity_is_a_no_op_and_returns_the_same_image(self):
        out = apply_filter_array(self.photo, definition())
        np.testing.assert_array_equal(out, self.photo)
        image = Image.fromarray(self.photo)
        self.assertIs(apply_filter(image, definition()), image)
        self.assertIs(apply_filter(image, None), image)

    def test_color_steps_match_spec_values(self):
        self.assertEqual(pixel((100, 150, 200), brightness=1.5), (150, 225, 255))      # clamps
        self.assertEqual(pixel((100, 150, 200), contrast=0.5), (114, 139, 164))
        r, g, b = pixel((200, 40, 40), grayscale=1)
        self.assertTrue(r == g == b)
        self.assertEqual(pixel((200, 40, 40), saturation=0), (r, r, r))           # same luma weights (.213/.715/.072 ≈)
        self.assertEqual(pixel((128, 128, 128), warmth=1), (173, 154, 120))
        self.assertEqual(pixel((10, 200, 30), hue=0), (10, 200, 30))
        self.assertNotEqual(pixel((10, 200, 30), hue=120), (10, 200, 30))

    def test_fade_lifts_blacks_and_lowers_whites(self):
        self.assertEqual(pixel((0, 0, 0), fade=1), (56, 56, 56))
        self.assertEqual(pixel((255, 255, 255), fade=1), (222, 222, 222))

    def test_tint_blend_modes_follow_w3c_formulas(self):
        base = (128, 64, 200)
        tint = {"color": "#ff8000", "strength": 1}
        self.assertEqual(pixel(base, tint={**tint, "blend": "multiply"}), (128, 32, 0))
        self.assertEqual(pixel(base, tint={**tint, "blend": "screen"}), (255, 160, 200))
        self.assertEqual(pixel(base, tint={**tint, "blend": "overlay"}), (255, 64, 145))
        soft = pixel(base, tint={**tint, "blend": "soft-light"})
        self.assertGreater(soft[0], 128)
        self.assertLess(soft[2], 200)
        half = pixel(base, tint={**tint, "blend": "multiply", "strength": 0.5})
        self.assertEqual(half, (128, 48, 100))

    def test_vignette_darkens_corners_not_center(self):
        flat = np.full((101, 81, 3), 200, dtype=np.uint8)
        out = apply_filter_array(flat, definition(vignette={"strength": 1, "size": 1}))
        self.assertEqual(out[50, 40, 0], 200)
        self.assertLess(out[0, 0, 0], 20)

    def test_grain_is_deterministic_per_frame_and_moves_between_frames(self):
        flat = np.full((64, 48, 3), 128, dtype=np.uint8)
        f = definition(grain={"amount": 1, "size": 0.5})
        first = apply_filter_array(flat, f, 3)
        np.testing.assert_array_equal(first, apply_filter_array(flat, f, 3))
        self.assertTrue((first != apply_filter_array(flat, f, 4)).any())
        self.assertTrue((first[..., 0] == first[..., 1]).all())  # monochrome grain
        self.assertLessEqual(int(np.abs(first.astype(int) - 128).max()), 52)  # ±0.2

    def test_grain_hash_and_cells_are_the_documented_integers(self):
        # lowbias32 reference values (computed independently with Python ints).
        def ref(x):
            x &= 0xFFFFFFFF
            x ^= x >> 16; x = (x * 0x7FEB352D) & 0xFFFFFFFF
            x ^= x >> 15; x = (x * 0x846CA68B) & 0xFFFFFFFF
            return x ^ (x >> 16)
        values = np.array([0, 1, 12345, 0xFFFFFFFF], dtype=np.uint32)
        self.assertEqual([int(v) for v in lowbias32(values)], [ref(int(v)) for v in values])
        self.assertEqual((grain_cells(0), grain_cells(0.5), grain_cells(1)), (320, 200, 80))
        noise = grain_noise(10, 20, 5, 0)
        self.assertEqual(noise.shape, (20, 10))
        self.assertTrue((noise[:, 0] == noise[:, 1]).all())  # 2 px per cell horizontally

    def test_full_frame_is_fast_enough_for_export(self):
        frame = (np.random.default_rng(1).random((1384, 1024, 3)) * 255).astype(np.uint8)
        heavy = definition(contrast=1.1, saturation=0.9, warmth=0.12, fade=0.15,
                           tint={"color": "#ffb36b", "strength": 0.25}, vignette={"strength": 0.25, "size": 0.4},
                           grain={"amount": 0.45, "size": 0.45})
        apply_filter_array(frame, heavy, 0)
        started = time.perf_counter()
        apply_filter_array(frame, heavy, 1)
        self.assertLess(time.perf_counter() - started, 1.0)  # generous guard against accidental O(n²) work


class FilterValidationTests(unittest.TestCase):
    def test_rejects_out_of_range_unknown_and_malformed_values(self):
        for bad in (
            {"brightness": 2}, {"hue": 181}, {"saturation": -0.1}, {"version": 2}, {"extra": 1},
            {"tint": {"color": "red", "blend": "soft-light", "strength": 0}},
            {"tint": {"color": "#ffffff", "blend": "darken", "strength": 0}},
            {"grain": {"amount": float("nan"), "size": 0.5}},
            {"vignette": {"strength": 0.5, "size": 0.5, "x": 1}},
        ):
            with self.subTest(bad=bad), self.assertRaises(ValidationError):
                FilterDefinition.model_validate({**IDENTITY, **bad})
        with self.assertRaises(ValidationError):
            FilterDefinition.model_validate({k: v for k, v in IDENTITY.items() if k != "fade"})

    def test_canonical_form_is_stable_and_identity_is_none(self):
        self.assertIsNone(canonical_filter(definition()))
        self.assertIsNone(canonical_filter(None))
        a = canonical_filter(definition(contrast=1.1, tint={"color": "#FFB36B", "strength": 0.2}))
        b = canonical_filter(definition(contrast=1.1, tint={"color": "#ffb36b", "strength": 0.2}))
        self.assertEqual(a, b)  # colour case never changes the render
        self.assertEqual(a["tint"]["color"], "#ffb36b")

    def test_canonical_form_keeps_precision_that_changes_the_render(self):
        # These grain sizes differ only at the 5th decimal but give different cell counts.
        fine, coarse = (definition(grain={"amount": 0.5, "size": size}) for size in (0.30208, 0.30209))
        self.assertNotEqual(grain_cells(fine.grain.size), grain_cells(coarse.grain.size))
        self.assertNotEqual(canonical_filter(fine), canonical_filter(coarse))


if __name__ == "__main__":
    unittest.main()
