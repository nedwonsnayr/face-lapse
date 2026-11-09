"""Verify actual rendered and encoded media without touching the app database."""
import copy
from datetime import datetime
import json
from pathlib import Path
import subprocess
import tempfile
import unittest
from unittest.mock import patch

from PIL import Image


def caption_pixels(image):
    pixels = list(image.crop((0, 1510, 1200, 1700)).getdata())
    date = sum(r < 110 and g < 110 and b < 110 for r, g, b in pixels)
    age = sum(r > 120 and g < 120 and b < 110 for r, g, b in pixels)
    return date, age


class VideoExportTests(unittest.TestCase):
    def setUp(self):
        # Delayed import keeps unittest discovery from initializing app config
        # before the existing API suite establishes its disposable database.
        from backend.app.services import video
        self.video = video
        self.temp = tempfile.TemporaryDirectory(prefix="styled-export-test-")
        self.root = Path(self.temp.name)
        self.source = self.root / "source.jpg"
        Image.new("RGB", (1200, 1600), (32, 80, 180)).save(self.source)
        self.metadata = [{"path": str(self.source), "date": datetime(2020, 8, 19), "age": 24}]

    def tearDown(self):
        self.temp.cleanup()

    def test_rendered_four_modes_keep_photo_clear_and_captions_independent(self):
        before = self.source.read_bytes()
        for date in [False, True]:
            for age in [False, True]:
                with self.subTest(date=date, age=age):
                    image = self.video.render_video_frame(str(self.source), "August 19, 2020" if date else None, 24 if age else None)
                    self.assertEqual(image.size, (1200, 1800))
                    self.assertEqual(image.getpixel((10, 10)), (255, 253, 249))
                    self.assertEqual(image.getpixel((70, 200)), (20, 19, 17))
                    self.assertLess(max(abs(actual - expected) for actual, expected in zip(image.getpixel((1090, 1400)), (32, 80, 180))), 4)
                    date_pixels, age_pixels = caption_pixels(image)
                    self.assertEqual(date_pixels > 100, date)
                    self.assertEqual(age_pixels > 100, age)
        self.assertEqual(self.source.read_bytes(), before)

    def test_encoded_video_has_styled_frame_exact_cadence_and_unique_result(self):
        metadata = self.metadata * 3
        original = copy.deepcopy(metadata)
        with patch.object(self.video, "VIDEOS_DIR", self.root):
            path = self.video.generate_video(metadata, frame_duration=.05, show_dates=False, show_age=True)
            second = self.video.generate_video(metadata, frame_duration=.05, show_dates=True, show_age=False)
        self.assertTrue(path)
        self.assertTrue(second)
        self.assertNotEqual(path, second)
        self.assertEqual(metadata, original, "Rendering must not replace caller paths with temporary files")
        info = json.loads(subprocess.check_output([
            "ffprobe", "-v", "error", "-show_entries", "stream=width,height,nb_frames:format=duration", "-of", "json", path,
        ]))
        self.assertEqual((info["streams"][0]["width"], info["streams"][0]["height"]), (1200, 1800))
        self.assertEqual(int(info["streams"][0]["nb_frames"]), 3)
        self.assertAlmostEqual(float(info["format"]["duration"]), .15, places=3)
        for name, date, age in [(path, False, True), (second, True, False)]:
            output = self.root / "decoded.png"
            subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", name, "-frames:v", "1", str(output)], check=True)
            with Image.open(output) as frame:
                date_pixels, age_pixels = caption_pixels(frame)
                self.assertEqual(date_pixels > 100, date)
                self.assertEqual(age_pixels > 100, age)
                self.assertGreater(min(frame.getpixel((10, 10))), 240)

    def test_render_failure_does_not_silently_export_an_unstyled_frame(self):
        with patch.object(self.video, "VIDEOS_DIR", self.root):
            result = self.video.generate_video([{"path": str(self.root / "missing.jpg")}])
        self.assertIsNone(result)
        self.assertEqual(list(self.root.glob("*.mp4")), [])

    def test_zero_age_is_rendered_and_missing_caption_data_is_omitted(self):
        image = self.video.render_video_frame(str(self.source), age=0)
        self.assertGreater(caption_pixels(image)[1], 100)
        image = self.video.render_video_frame(str(self.source))
        self.assertEqual(caption_pixels(image), (0, 0))

    def test_progress_reports_render_counts_then_encoding(self):
        events = []
        with patch.object(self.video, "VIDEOS_DIR", self.root):
            result = self.video.generate_video(self.metadata * 2, on_progress=lambda *event: events.append(event))
        self.assertTrue(result)
        self.assertEqual(events, [("rendering", 0, 2), ("rendering", 1, 2), ("rendering", 2, 2), ("encoding", 2, 2)])

    def test_rendering_does_not_mutate_reusable_background(self):
        first = self.video.render_video_frame(str(self.source))
        self.video.render_video_frame(str(self.source), "August 19, 2020", 24)
        second = self.video.render_video_frame(str(self.source))
        self.assertEqual(first.tobytes(), second.tobytes())
