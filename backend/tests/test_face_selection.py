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
