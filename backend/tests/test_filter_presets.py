"""Saved filter presets: CRUD, validation, shared scope and migration 011."""
import importlib
from pathlib import Path
import tempfile
import unittest

from fastapi.testclient import TestClient
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

LOOK = {
    "version": 1, "brightness": 1.04, "contrast": 1, "saturation": 1.15, "grayscale": 0, "warmth": 0.2, "hue": 0,
    "fade": 0, "tint": {"color": "#ffb36b", "blend": "soft-light", "strength": 0.25},
    "vignette": {"strength": 0, "size": 0.5}, "grain": {"amount": 0, "size": 0.5},
}


class FilterPresetTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.app.database import Base, get_db
        from backend.app.main import app
        cls.temp = tempfile.TemporaryDirectory(prefix="filter-preset-tests-")
        cls.engine = create_engine(f"sqlite:///{Path(cls.temp.name) / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(cls.engine)
        cls.sessions = sessionmaker(bind=cls.engine)

        def get_test_db():
            with cls.sessions() as db:
                yield db
        cls.old_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_db] = get_test_db
        cls.client = TestClient(app)  # no lifespan: never touches the configured data dir

    @classmethod
    def tearDownClass(cls):
        from backend.app.main import app
        cls.client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(cls.old_overrides)
        cls.engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        with self.engine.begin() as conn:
            conn.execute(text("DELETE FROM filter_presets"))
            conn.execute(text("INSERT OR IGNORE INTO profiles (id, name) VALUES (1, 'Ryan')"))

    def create(self, name="Golden hour", definition=LOOK):
        return self.client.post("/api/filters", json={"name": name, "definition": definition})

    def test_create_list_update_and_delete(self):
        created = self.create("  Golden   hour ")
        self.assertEqual(created.status_code, 201)
        preset = created.json()
        self.assertEqual(preset["name"], "Golden hour")
        self.assertEqual(preset["definition"]["tint"]["color"], "#ffb36b")
        self.create("alpha")
        self.assertEqual([p["name"] for p in self.client.get("/api/filters").json()], ["alpha", "Golden hour"])

        changed = self.client.put(f"/api/filters/{preset['id']}", json={"name": "Dusk", "definition": {**LOOK, "fade": 0.4}})
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json()["definition"]["fade"], 0.4)
        # Renaming to its own name (different case) is allowed.
        self.assertEqual(self.client.put(f"/api/filters/{preset['id']}", json={"name": "DUSK", "definition": LOOK}).status_code, 200)

        self.assertEqual(self.client.delete(f"/api/filters/{preset['id']}").status_code, 204)
        self.assertEqual(self.client.delete(f"/api/filters/{preset['id']}").status_code, 404)
        self.assertEqual(self.client.put(f"/api/filters/{preset['id']}", json={"name": "x", "definition": LOOK}).status_code, 404)
        self.assertEqual([p["name"] for p in self.client.get("/api/filters").json()], ["alpha"])

    def test_names_are_unique_ignoring_case_and_required(self):
        self.assertEqual(self.create("Dusk").status_code, 201)
        other = self.create("Other").json()
        duplicate = self.create("dusk")
        self.assertEqual(duplicate.status_code, 409)
        self.assertIn("already exists", duplicate.json()["detail"])
        self.assertEqual(self.client.put(f"/api/filters/{other['id']}", json={"name": "DUSK", "definition": LOOK}).status_code, 409)
        for name in ("", "   ", "x" * 41):
            self.assertEqual(self.create(name).status_code, 422, name)

    def test_definitions_are_validated(self):
        for bad in ({**LOOK, "contrast": 3}, {**LOOK, "script": "<b>"}, {**LOOK, "tint": {**LOOK["tint"], "color": "url(x)"}},
                    {k: v for k, v in LOOK.items() if k != "grain"}, "nope"):
            self.assertEqual(self.create("Bad", bad).status_code, 422)
        self.assertEqual(self.client.post("/api/filters", json={"name": "x", "definition": LOOK, "extra": 1}).status_code, 422)
        self.assertEqual(self.client.get("/api/filters").json(), [])

    def test_cap_on_saved_filters(self):
        from backend.app.routers import filters
        for index in range(filters.MAX_PRESETS):
            self.assertEqual(self.create(f"Look {index}").status_code, 201)
        over = self.create("One too many")
        self.assertEqual(over.status_code, 409)
        self.assertIn("up to 50", over.json()["detail"])

    def test_export_rejects_an_invalid_filter_before_any_work(self):
        for body in ({"filter": {**LOOK, "brightness": 9}}, {"filter": "mono"}, {"filter": LOOK, "other": 1}):
            response = self.client.post("/api/video/generate?frame_duration=0.1", json=body)
            self.assertEqual(response.status_code, 422, body)

    def test_presets_are_shared_by_every_person(self):
        self.create("Shared")
        for profile_id in (1, 2, 99):
            names = [p["name"] for p in self.client.get(f"/api/filters?profile_id={profile_id}").json()]
            self.assertEqual(names, ["Shared"])


class FilterPresetMigrationTests(unittest.TestCase):
    def test_migration_creates_table_once_and_keeps_rows(self):
        migration = importlib.import_module("migrations.011_add_filter_presets")
        with tempfile.TemporaryDirectory() as temp:
            engine = create_engine(f"sqlite:///{Path(temp) / 'legacy.db'}")
            with engine.connect() as conn:
                conn.execute(text("CREATE TABLE images (id INTEGER PRIMARY KEY)"))
                conn.execute(text("INSERT INTO images (id) VALUES (7)"))
                conn.commit()
                self.assertTrue(migration.up(conn))
                conn.execute(text("INSERT INTO filter_presets (name, definition) VALUES ('Kept', '{}')"))
                conn.commit()
                self.assertTrue(migration.up(conn))  # idempotent
                self.assertEqual(conn.execute(text("SELECT name FROM filter_presets")).scalars().all(), ["Kept"])
                self.assertEqual(conn.execute(text("SELECT id FROM images")).scalars().all(), [7])
            engine.dispose()


if __name__ == "__main__":
    unittest.main()
