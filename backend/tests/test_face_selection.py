"""Real detector/API regression tests; always use a disposable database."""
import importlib
import io
import os
from pathlib import Path
import tempfile
import unittest

from PIL import Image as PILImage
from sqlalchemy import create_engine, text


class FaceSelectionTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="face-selection-test-")
        os.environ["FACE_LAPSE_DATA_DIR"] = cls.temp.name
        os.environ.pop("CF_ACCESS_TEAM_DOMAIN", None)
        os.environ.pop("CF_ACCESS_AUD", None)
        os.environ.pop("FACE_LAPSE_STATIC_DIR", None)
        from fastapi.testclient import TestClient
        from backend.app.main import app
        cls.context = TestClient(app)
        cls.client = cls.context.__enter__()
        cls.fixtures = Path(__file__).resolve().parents[2] / "e2e/fixtures"

    @classmethod
    def tearDownClass(cls):
        cls.context.__exit__(None, None, None)
        from backend.app.database import engine
        engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        for image in self.client.get("/api/images").json():
            self.client.delete(f"/api/images/{image['id']}")

    def upload(self, name="two_faces.jpg", data=None):
        response = self.client.post("/api/images/upload", files={
            "files": (name, data or (self.fixtures / name).read_bytes(), "image/jpeg")
        })
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()[0]["id"]

    def align(self, image_id):
        response = self.client.post("/api/images/align", json={"image_ids": [image_id]})
        self.assertIn('"type": "done"', response.text, response.text)
        return self.client.get("/api/images").json()[0]

    def test_multiple_faces_wait_and_survive_bulk_dismiss_and_export(self):
        image_id = self.upload()
        image = self.align(image_id)
        self.assertTrue(image["needs_face_selection"])
        self.assertFalse(image["pending"])
        self.assertFalse(image["included_in_video"])
        self.assertFalse(image["has_aligned"])
        self.assertEqual(self.client.delete("/api/images/no-face").json()["deleted"], 0)
        self.assertEqual(self.client.post("/api/video/generate").status_code, 400)
        self.assertTrue(self.client.get("/api/images").json()[0]["needs_face_selection"])

    def test_selection_change_and_realign_keep_exact_geometry_and_fresh_urls(self):
        image_id = self.upload()
        self.align(image_id)
        faces = self.client.post(f"/api/images/{image_id}/faces").json()
        self.assertEqual(len(faces["faces"]), 2)
        for index in [1, 0]:
            old_version = self.client.get("/api/images").json()[0]["content_hash"]
            response = self.client.post(f"/api/images/{image_id}/select-face", json={"face_index": index})
            self.assertEqual(response.status_code, 200, response.text)
            image = self.client.get("/api/images").json()[0]
            self.assertEqual(image["selected_face_index"], index)
            self.assertNotEqual(image["content_hash"], old_version)
            self.assertFalse(image["needs_face_selection"])
            self.assertTrue(image["has_aligned"])
            self.assertTrue(image["included_in_video"])
        from backend.app.database import SessionLocal
        from backend.app.models import Image
        with SessionLocal() as db:
            image = db.get(Image, image_id)
            eyes = (image.left_eye_x, image.left_eye_y, image.right_eye_x, image.right_eye_y)
            self.assertAlmostEqual(eyes[0], faces["faces"][0]["left_eye"][0] * PILImage.open(self.fixtures / "two_faces.jpg").width, places=4)
        self.assertEqual(self.client.post(f"/api/images/{image_id}/realign").status_code, 200)
        with SessionLocal() as db:
            image = db.get(Image, image_id)
            self.assertEqual(image.selected_face_index, 0)
            self.assertEqual((image.left_eye_x, image.left_eye_y, image.right_eye_x, image.right_eye_y), eyes)
        self.assertEqual(self.client.post(f"/api/images/{image_id}/faces").json()["faces"], faces["faces"])

    def test_invalid_choices_do_not_change_selection(self):
        image_id = self.upload()
        self.align(image_id)
        for value, status in [(-1, 422), (20, 400), (0.5, 422), (True, 422), ("0", 422)]:
            self.assertEqual(self.client.post(f"/api/images/{image_id}/select-face", json={"face_index": value}).status_code, status)
        self.assertTrue(self.client.get("/api/images").json()[0]["needs_face_selection"])
        self.assertEqual(self.client.post("/api/images/999999/select-face", json={"face_index": 0}).status_code, 404)

    def test_single_face_still_aligns_automatically(self):
        image_id = self.upload("face_1.jpg")
        image = self.align(image_id)
        self.assertTrue(image["has_aligned"])
        self.assertFalse(image["needs_face_selection"])
        self.assertEqual(image["selected_face_index"], 0)

    def test_no_face_still_can_be_dismissed(self):
        image_id = self.upload("1.jpg")
        image = self.align(image_id)
        self.assertFalse(image["needs_face_selection"])
        self.assertFalse(image["has_aligned"])
        self.assertEqual(self.client.delete("/api/images/no-face").json()["deleted"], 1)

    def test_oriented_original_and_renditions_have_distinct_contents(self):
        original = PILImage.open(self.fixtures / "two_faces.jpg")
        # Store rotated pixels with an EXIF orientation restoring the original.
        exif = PILImage.Exif()
        exif[274] = 6
        data = io.BytesIO()
        original.transpose(PILImage.Transpose.ROTATE_90).save(data, format="JPEG", exif=exif)
        image_id = self.upload("rotated.jpg", data.getvalue())
        self.assertTrue(self.align(image_id)["needs_face_selection"])
        choices = self.client.post(f"/api/images/{image_id}/faces").json()
        self.assertEqual(len(choices["faces"]), 2)
        before = self.client.get(f"/api/images/{image_id}/original?size=thumb").content
        self.client.post(f"/api/images/{image_id}/select-face", json={"face_index": 0})
        after = self.client.get(f"/api/images/{image_id}/aligned?size=thumb").content
        self.assertNotEqual(before, after)
        self.assertGreater(PILImage.open(io.BytesIO(before)).width, PILImage.open(io.BytesIO(before)).height)
        self.assertEqual(PILImage.open(io.BytesIO(after)).size, (300, 400))

    def test_discovery_preserves_existing_alignment_until_confirmed(self):
        image_id = self.upload("face_1.jpg")
        image = self.align(image_id)
        # Emulate an image aligned before this feature existed.
        from backend.app.database import SessionLocal
        from backend.app.models import Image
        with SessionLocal() as db:
            row = db.get(Image, image_id)
            row.face_candidates = None
            row.selected_face_index = None
            db.commit()
        image = self.client.get("/api/images").json()[0]
        self.assertEqual(len(self.client.post(f"/api/images/{image_id}/faces").json()["faces"]), 1)
        self.assertEqual(self.client.get("/api/images").json()[0], image)

    def test_disconnected_alignment_keeps_processed_choice_in_database(self):
        image_id = self.upload()
        from backend.app.routers.images import _align_images_stream
        stream = _align_images_stream([image_id])
        self.assertIn('"type": "progress"', next(stream))
        stream.close()
        image = self.client.get("/api/images").json()[0]
        self.assertTrue(image["needs_face_selection"])
        self.assertFalse(image["pending"])

    def test_distant_faces_are_deduplicated_and_mapped_to_original(self):
        import cv2
        import math
        from backend.app.services.alignment import detect_faces, _load_image_with_exif, _detect_face_landmarks
        source = str(self.fixtures / "distant_faces.jpg")
        rgb = cv2.cvtColor(_load_image_with_exif(source), cv2.COLOR_BGR2RGB)
        self.assertEqual(len(_detect_face_landmarks(rgb)), 0, "Fixture must reproduce the full-frame miss")
        faces = detect_faces(source)
        self.assertEqual(len(faces), 2, "Overlapping crops must not create duplicate choices")
        reference = detect_faces(str(self.fixtures / "two_faces.jpg"))
        for original, detected in zip(reference, faces):
            for eye in ["left_eye", "right_eye"]:
                # Public composite is placed at (301,1000) in a 1204x2400 canvas.
                expected = (original[eye][0] * 602 + 301, original[eye][1] * 400 + 1000)
                actual = (detected[eye][0] * 1204, detected[eye][1] * 2400)
                self.assertLess(math.dist(expected, actual), 16, "Eye coordinates must refer to the original, not a search tile")

    def test_off_center_face_is_found_outside_center_crop(self):
        import cv2
        from backend.app.services.alignment import detect_faces, _load_image_with_exif, _detect_face_landmarks
        canvas = PILImage.new("RGB", (1204, 2400), (210, 210, 210))
        with PILImage.open(self.fixtures / "face_1.jpg") as face:
            canvas.paste(face, (20, 1000))
        source = Path(self.temp.name) / "off-center.jpg"
        canvas.save(source)
        rgb = cv2.cvtColor(_load_image_with_exif(str(source)), cv2.COLOR_BGR2RGB)
        self.assertEqual(len(_detect_face_landmarks(rgb)), 0)
        faces = detect_faces(str(source))
        self.assertEqual(len(faces), 1)
        self.assertLess(faces[0]["bounds"]["x"], .25)
        self.assertLess(faces[0]["left_eye"][0], .25)

    def test_close_up_face_keeps_existing_fast_path(self):
        from unittest.mock import patch
        from backend.app.services import alignment
        with patch.object(alignment, "_search_crops", side_effect=AssertionError("Unnecessary crop search")):
            self.assertEqual(len(alignment.detect_faces(str(self.fixtures / "face_1.jpg"))), 1)

    def test_failed_detection_has_bounded_crop_count_and_resolution(self):
        from unittest.mock import patch
        import numpy as np
        from backend.app.services import alignment
        with patch.object(alignment, "_detect_face_landmarks", return_value=[]) as detector:
            faces = alignment._faces_in_image(np.zeros((2200, 1000, 3), dtype=np.uint8))
        self.assertEqual(faces, [])
        self.assertEqual(detector.call_count, 11)  # original + downscaled + 9 crops
        for call in detector.call_args_list[2:]:
            self.assertLessEqual(max(call.args[0].shape[:2]), 1024)

    def test_tiny_images_do_not_trigger_useless_crop_search(self):
        from unittest.mock import patch
        import numpy as np
        from backend.app.services import alignment
        with patch.object(alignment, "_detect_face_landmarks", return_value=[]) as detector:
            self.assertEqual(alignment._faces_in_image(np.zeros((32, 32, 3), dtype=np.uint8)), [])
        self.assertEqual(detector.call_count, 1)

    def test_distant_photo_enters_picker_and_preserves_original_on_selection(self):
        image_id = self.upload("distant_faces.jpg")
        image = self.align(image_id)
        self.assertTrue(image["needs_face_selection"])
        choices = self.client.post(f"/api/images/{image_id}/faces").json()
        self.assertEqual(len(choices["faces"]), 2)
        response = self.client.post(f"/api/images/{image_id}/select-face", json={"face_index": 1})
        self.assertEqual(response.status_code, 200, response.text)
        self.assertEqual(self.client.get(f"/api/images/{image_id}/original").content, (self.fixtures / "distant_faces.jpg").read_bytes())
        self.assertTrue(self.client.post(f"/api/images/{image_id}/realign").json()["face_detected"])
        self.assertEqual(self.client.get("/api/images").json()[0]["selected_face_index"], 1)

    def test_export_date_and_age_flags_are_independent(self):
        from datetime import datetime
        from unittest.mock import patch
        from backend.app.database import SessionLocal
        from backend.app.models import Image
        image_id = self.upload("face_1.jpg")
        self.align(image_id)
        with SessionLocal() as db:
            db.get(Image, image_id).photo_taken_at = datetime(2020, 8, 19)
            db.commit()
        for dates in [False, True]:
            for age in [False, True]:
                with self.subTest(dates=dates, age=age):
                    with patch("backend.app.routers.video._start_job", return_value={"status": "running"}) as job:
                        response = self.client.post("/api/video/generate", params={
                            "show_dates": str(dates).lower(), "show_age": str(age).lower(), "birthday": "1995-10-06",
                        })
                    self.assertEqual(response.status_code, 202, response.text)
                    metadata, _, actual_dates, actual_age = job.call_args.args
                    self.assertEqual((actual_dates, actual_age), (dates, age))
                    self.assertEqual(metadata[0]["date"], datetime(2020, 8, 19))
                    self.assertEqual(metadata[0]["age"], 24 if age else None)

    def test_age_export_requires_valid_birthday_only_when_enabled(self):
        from unittest.mock import patch
        image_id = self.upload("face_1.jpg")
        self.align(image_id)
        for birthday in [None, "garbage", "1995-02-30"]:
            params = {"show_age": "true", "show_dates": "false"}
            if birthday is not None:
                params["birthday"] = birthday
            self.assertEqual(self.client.post("/api/video/generate", params=params).status_code, 422)
        with patch("backend.app.routers.video._start_job", return_value={"status": "running"}):
            self.assertEqual(self.client.post("/api/video/generate", params={"show_age": "false", "birthday": "unused"}).status_code, 202)

    def test_additive_migration_is_idempotent_and_preserves_legacy_rows(self):
        migration = importlib.import_module("migrations.007_add_face_selection")
        engine = create_engine("sqlite://")
        with engine.connect() as conn:
            conn.execute(text("CREATE TABLE images (id INTEGER PRIMARY KEY, original_path TEXT, aligned_path TEXT)"))
            conn.execute(text("INSERT INTO images VALUES (1, 'original.jpg', 'aligned.jpg')"))
            conn.commit()
            self.assertTrue(migration.up(conn))
            self.assertFalse(migration.up(conn))
            row = conn.execute(text("SELECT original_path, aligned_path, needs_face_selection FROM images")).one()
            self.assertEqual(tuple(row), ("original.jpg", "aligned.jpg", 0))
        engine.dispose()


if __name__ == "__main__":
    unittest.main()
