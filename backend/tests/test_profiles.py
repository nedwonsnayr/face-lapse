"""Person boundaries, migration retention and independent face choices."""
import importlib
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from fastapi.testclient import TestClient


class ProfileTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from backend.app.database import Base, get_db
        from backend.app.main import app
        from backend.app.routers import images, video, archive
        from backend.app.services import resize
        cls.temp = tempfile.TemporaryDirectory(prefix="person-tests-")
        cls.root = Path(cls.temp.name)
        for name in ('originals', 'aligned', 'thumbs', 'videos'):
            (cls.root / name).mkdir()
        cls.engine = create_engine(f"sqlite:///{cls.root / 'test.db'}", connect_args={"check_same_thread": False})
        Base.metadata.create_all(cls.engine)
        cls.sessions = sessionmaker(bind=cls.engine)
        cls.migration = importlib.import_module('migrations.008_add_person_profiles')
        with cls.engine.connect() as conn:
            cls.migration.up(conn)
        def get_test_db():
            with cls.sessions() as db:
                yield db
        cls.old_overrides = dict(app.dependency_overrides)
        app.dependency_overrides[get_db] = get_test_db
        cls.patches = [patch.object(images, 'SessionLocal', cls.sessions),
                       patch.object(archive, 'DATA_DIR', cls.root),
                       patch.object(archive, 'ORIGINALS_DIR', cls.root / 'originals'),
                       patch.object(archive, 'ALIGNED_DIR', cls.root / 'aligned'),
                       patch.object(images, 'ORIGINALS_DIR', cls.root / 'originals'),
                       patch.object(images, 'ALIGNED_DIR', cls.root / 'aligned'),
                       patch.object(resize, 'THUMBS_DIR', cls.root / 'thumbs'),
                       patch.object(video, 'VIDEOS_DIR', cls.root / 'videos'),
                       patch.object(video, '_jobs', {})]
        for p in cls.patches:
            p.start()
        # No lifespan: it must never touch the application's configured data dir.
        cls.client = TestClient(app)
        cls.fixtures = Path(__file__).resolve().parents[2] / 'e2e/fixtures'

    @classmethod
    def tearDownClass(cls):
        from backend.app.main import app
        cls.client.close()
        app.dependency_overrides.clear()
        app.dependency_overrides.update(cls.old_overrides)
        for p in reversed(cls.patches):
            p.stop()
        cls.engine.dispose()
        cls.temp.cleanup()

    def setUp(self):
        from backend.app.models import Image, Profile
        from backend.app.routers import video
        video._jobs.clear()
        with self.sessions() as db:
            db.query(Image).delete()
            db.query(Profile).filter(Profile.id != 1).delete()
            db.get(Profile, 1).birthday = '1995-10-06'
            db.commit()
        self.other = self.client.post('/api/profiles', json={'name': 'Alex', 'birthday': '2000-03-04'}).json()['id']

    def upload(self, profile=1, filename='two_faces.jpg'):
        response = self.client.post(f'/api/images/upload?profile_id={profile}', files={
            'files': (filename, (self.fixtures / filename).read_bytes(), 'image/jpeg')})
        self.assertEqual(response.status_code, 200, response.text)
        return response.json()[0]

    def test_burst_of_image_requests_does_not_starve_database_pool(self):
        import asyncio
        import httpx
        from backend.app.database import get_db
        from backend.app.main import app
        # A small pool makes the same worker/connection contention reproducible
        # without requiring hundreds of requests or a 30-second production timeout.
        engine = create_engine(f"sqlite:///{self.root / 'test.db'}",
                               connect_args={"check_same_thread": False},
                               pool_size=2, max_overflow=0, pool_timeout=0.5)
        sessions = sessionmaker(bind=engine)
        image = self.upload()['id']
        from backend.app.models import Image
        with self.sessions() as db:
            record = db.get(Image, image)
            record.aligned_path = record.original_path
            db.commit()
        old = app.dependency_overrides[get_db]
        def get_small_pool_db():
            with sessions() as db:
                yield db
        app.dependency_overrides[get_db] = get_small_pool_db
        async def burst():
            transport = httpx.ASGITransport(app=app, raise_app_exceptions=False)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
                return await asyncio.gather(*[
                    client.get(f'/api/images/{image}/{kind}?profile_id=1&size={size}')
                    for _ in range(20)
                    for kind, size in [('original', 'thumb'), ('aligned', 'thumb'),
                                       ('aligned', 'frame'), ('original', 'full')]
                ])
        try:
            responses = asyncio.run(burst())
            self.assertEqual([r.status_code for r in responses], [200] * 80)
            self.assertTrue(all(r.headers['content-type'] == 'image/jpeg' for r in responses))
            self.assertEqual(engine.pool.checkedout(), 0)
        finally:
            app.dependency_overrides[get_db] = old
            engine.dispose()

    def test_creation_validation_editing_and_invalid_scope(self):
        response = self.client.get('/api/profiles')
        self.assertEqual(response.json()[0]['name'], 'Ryan')
        self.assertEqual(self.client.get(f'/api/images?profile_id={self.other}').json(), [])
        for body in ({'name': '  '}, {'name': 'x' * 81}, {'name': 'Alex', 'birthday': '2000-02-30'}):
            self.assertEqual(self.client.post('/api/profiles', json=body).status_code, 422)
        updated = self.client.patch(f'/api/profiles/{self.other}', json={'name': '  Alice  ', 'birthday': None})
        self.assertEqual(updated.json()['name'], 'Alice')
        self.assertIsNone(updated.json()['birthday'])
        for scope, status in ((999999, 404), (0, 422)):
            self.assertEqual(self.client.get(f'/api/images?profile_id={scope}').status_code, status)
        self.assertEqual(self.client.patch('/api/profiles/99999', json={'name': 'No'}).status_code, 404)

    def test_same_source_in_both_people_has_independent_faces_and_files(self):
        from backend.app.models import Image
        first = self.upload()['id']
        second = self.upload(self.other)['id']
        self.assertNotEqual(first, second)
        self.assertTrue(self.upload(self.other)['skipped'])
        for profile, image, face in ((1, first, 0), (self.other, second, 1)):
            res = self.client.post(f'/api/images/align?profile_id={profile}', json={'image_ids': [image]})
            self.assertIn('"type": "done"', res.text)
            self.assertEqual(self.client.post(f'/api/images/{image}/select-face?profile_id={profile}', json={'face_index': face}).status_code, 200)
        with self.sessions() as db:
            a, b = db.get(Image, first), db.get(Image, second)
            self.assertEqual((a.selected_face_index, b.selected_face_index), (0, 1))
            self.assertNotEqual(a.original_path, b.original_path)
            self.assertNotEqual(a.aligned_path, b.aligned_path)
            bpath = Path(b.original_path)
        self.client.delete(f'/api/images/{first}')
        self.assertTrue(bpath.exists())
        self.assertEqual(len(self.client.get(f'/api/images?profile_id={self.other}').json()), 1)

    def test_wrong_person_reads_writes_and_mixed_batches_fail_without_partial_changes(self):
        from backend.app.models import Image
        first = self.upload()['id']
        second = self.upload(self.other)['id']
        for path, method, body in [('original', 'get', None), ('aligned', 'get', None), ('toggle', 'patch', None),
                                   ('realign', 'post', None), ('faces', 'post', None), ('select-face', 'post', {'face_index': 0}),
                                   ('', 'delete', None)]:
            url = f'/api/images/{second}{"/" + path if path else ""}?profile_id=1'
            kwargs = {'json': body} if body else {}
            self.assertEqual(getattr(self.client, method)(url, **kwargs).status_code, 404, url)
        self.assertEqual(self.client.post('/api/images/align', json={'image_ids': [first, second]}).status_code, 404)
        self.assertEqual(self.client.patch('/api/images/reorder', json=[{'id': first, 'sort_order': 8}, {'id': second, 'sort_order': 9}]).status_code, 404)
        with self.sessions() as db:
            self.assertIsNone(db.get(Image, first).sort_order)
            self.assertFalse(db.get(Image, first).align_attempted)

    def test_no_face_bulk_delete_is_scoped_and_preserves_staging(self):
        from backend.app.models import Image
        first = self.upload()['id']
        second = self.upload(self.other)['id']
        with self.sessions() as db:
            db.get(Image, first).align_attempted = True
            db.get(Image, second).align_attempted = True
            db.commit()
        self.assertEqual(self.client.delete('/api/images/no-face').json()['deleted'], 1)
        self.assertEqual(self.client.get(f'/api/images?profile_id={self.other}').json()[0]['id'], second)

    def test_export_input_jobs_and_completed_downloads_belong_to_person(self):
        from backend.app.routers import video
        from backend.app.models import Image
        first = self.upload(1, 'face_1.jpg')['id']
        second = self.upload(self.other, 'face_1.jpg')['id']
        for profile, image in ((1, first), (self.other, second)):
            self.client.post(f'/api/images/align?profile_id={profile}', json={'image_ids': [image]})
        with patch.object(video, '_start_job', return_value={'status': 'running'}) as start:
            res = self.client.post(f'/api/video/generate?profile_id={self.other}&show_age=true&birthday=2000-03-04')
            self.assertEqual(res.status_code, 202, res.text)
            self.assertEqual([i['id'] for i in start.call_args.args[0]], [second])
            self.assertEqual(start.call_args.kwargs['profile_id'], self.other)
        video._jobs['test'] = {'_profile_id': self.other, '_key': 'secret', 'job_id': 'test', 'status': 'done'}
        self.assertEqual(self.client.get('/api/video/jobs/test').status_code, 404)
        self.assertEqual(self.client.get(f'/api/video/jobs/test?profile_id={self.other}').json()['status'], 'done')
        for filename, owner in [('legacy.mp4', 1), (f'person-{self.other}-export.mp4', self.other)]:
            (self.root / 'videos' / filename).write_bytes(b'video')
            for profile in (1, self.other):
                self.assertEqual(self.client.get(f'/api/video/{filename}?profile_id={profile}').status_code, 200 if owner == profile else 404)

    def test_missing_date_never_uses_another_person_as_a_neighbour(self):
        from datetime import datetime
        from backend.app.models import Image
        first = self.upload(1, 'face_1.jpg')['id']
        with self.sessions() as db:
            db.get(Image, first).photo_taken_at = datetime(1900, 1, 1)
            db.commit()
        second = self.upload(self.other, 'face_2.jpg')['id']
        with self.sessions() as db:
            photo = db.get(Image, second)
            self.assertEqual(photo.photo_taken_at, photo.created_at)

    def test_legacy_migration_is_idempotent_and_preserves_data(self):
        with tempfile.TemporaryDirectory() as temp:
            engine = create_engine(f'sqlite:///{temp}/legacy.db')
            with engine.begin() as conn:
                conn.execute(text('CREATE TABLE images (id INTEGER PRIMARY KEY, original_path TEXT, sort_order INTEGER)'))
                conn.execute(text("INSERT INTO images VALUES(7, '/old/original.jpg', 42)"))
            with engine.connect() as conn:
                conn.execute(text("PRAGMA foreign_keys=ON"))
                conn.commit()
                self.migration.up(conn)
                self.assertEqual(conn.execute(text("PRAGMA foreign_keys")).scalar(), 1)
                conn.execute(text("UPDATE profiles SET name='Renamed' WHERE id=1"))
                conn.commit()
                self.migration.up(conn)
                self.assertEqual(tuple(conn.execute(text('SELECT id, original_path, sort_order, profile_id FROM images')).first()), (7, '/old/original.jpg', 42, 1))
                self.assertEqual(conn.execute(text('SELECT name FROM profiles WHERE id=1')).scalar(), 'Renamed')
                self.assertEqual(conn.execute(text('PRAGMA integrity_check')).scalar(), 'ok')
            engine.dispose()

    def test_trash_restore_batch_and_permanent_delete(self):
        from backend.app.models import Image
        first = self.upload(1, 'face_1.jpg')['id']
        second = self.upload(1, 'face_2.jpg')['id']
        with self.sessions() as db:
            original = Path(db.get(Image, first).original_path)
        wrong = self.upload(self.other, 'face_3.jpg')['id']
        response = self.client.post('/api/archive/trash', json={'image_ids': [first, wrong]})
        self.assertEqual(response.status_code, 404)
        self.assertEqual(len(self.client.get('/api/images').json()), 2)
        self.assertEqual(self.client.post('/api/archive/trash', json={'image_ids': [first, second]}).status_code, 200)
        self.assertEqual(self.client.get('/api/images').json(), [])
        self.assertTrue(original.exists())
        self.assertEqual(len(self.client.get('/api/archive/trash').json()), 2)
        self.assertEqual(self.client.patch(f'/api/images/{first}/toggle').status_code, 404)
        self.assertEqual(self.client.post('/api/images/align', json={'image_ids': [first]}).status_code, 404)
        self.assertEqual(self.client.post('/api/video/generate').status_code, 400)
        self.assertEqual(self.client.post(f'/api/archive/restore?profile_id={self.other}', json={'image_ids': [first]}).status_code, 404)
        self.assertEqual(self.client.post('/api/archive/restore', json={'image_ids': [first, second]}).status_code, 200)
        self.assertEqual(len(self.client.get('/api/images').json()), 2)
        self.assertEqual(self.client.delete(f'/api/archive/trash/{first}').status_code, 404)
        self.client.delete(f'/api/images/{first}')
        self.assertEqual(self.client.delete(f'/api/archive/trash/{first}').status_code, 200)
        self.assertFalse(original.exists())

    def test_transfer_copies_independent_files_and_move_is_atomic(self):
        from backend.app.models import Image
        first = self.upload(1, 'face_1.jpg')['id']
        with self.sessions() as db:
            source = db.get(Image, first)
            source.aligned_path = str(self.root / 'aligned' / 'test-transfer.jpg')
            Path(source.aligned_path).write_bytes(Path(source.original_path).read_bytes())
            source.align_attempted = True
            source.face_detected = True
            db.commit()
        body = {'image_ids': [first], 'target_profile_id': self.other, 'mode': 'copy'}
        result = self.client.post('/api/archive/transfer', json=body)
        self.assertEqual(result.status_code, 200, result.text)
        copied = result.json()['image_ids'][0]
        with self.sessions() as db:
            source, target = db.get(Image, first), db.get(Image, copied)
            self.assertNotEqual(source.original_path, target.original_path)
            self.assertNotEqual(source.aligned_path, target.aligned_path)
            copied_path = Path(target.original_path)
            self.assertEqual(Path(source.original_path).read_bytes(), copied_path.read_bytes())
        self.assertEqual(self.client.post('/api/archive/transfer', json=body).status_code, 409)
        second = self.upload(1, 'face_2.jpg')['id']
        body.update(image_ids=[first, second], mode='move')
        self.assertEqual(self.client.post('/api/archive/transfer', json=body).status_code, 409)
        self.assertEqual(len(self.client.get('/api/images').json()), 2)
        body['image_ids'] = [second]
        self.assertEqual(self.client.post('/api/archive/transfer', json=body).status_code, 200)
        self.assertEqual(self.client.get(f'/api/images/{second}/original').status_code, 404)
        self.assertEqual(self.client.get(f'/api/images/{second}/original?profile_id={self.other}').status_code, 200)
        self.client.delete(f'/api/images/{first}')
        self.client.delete(f'/api/archive/trash/{first}')
        self.assertTrue(copied_path.exists())

    def test_copy_failure_cleans_up_and_restore_conflict_preserves_trash(self):
        from backend.app.routers import archive
        first = self.upload(1, 'face_1.jpg')['id']
        before = set((self.root / 'originals').glob('copy-*'))
        with patch.object(archive.shutil, 'copyfile', side_effect=OSError('disk full')):
            with self.assertRaises(OSError):
                self.client.post('/api/archive/transfer', json={'image_ids': [first], 'target_profile_id': self.other, 'mode': 'copy'})
        self.assertEqual(set((self.root / 'originals').glob('copy-*')), before)
        self.assertEqual(self.client.get(f'/api/images?profile_id={self.other}').json(), [])
        self.client.delete(f'/api/images/{first}')
        self.upload(1, 'face_1.jpg')
        self.assertEqual(self.client.post('/api/archive/restore', json={'image_ids': [first]}).status_code, 409)
        self.assertEqual(len(self.client.get('/api/archive/trash').json()), 1)

    def test_health_is_scoped_and_backup_status_is_not_invented(self):
        import json
        from backend.app.models import Image
        status = self.root / 'backup-status.json'
        status.unlink(missing_ok=True)
        first = self.upload(1, 'face_1.jpg')['id']
        self.upload(self.other, 'face_2.jpg')
        with self.sessions() as db:
            Path(db.get(Image, first).original_path).unlink()
        result = self.client.get('/api/archive/health').json()
        self.assertEqual((result['photos'], result['missing_originals'], result['pending']), (1, 1, 1))
        self.assertEqual(result['backup']['status'], 'unknown')
        self.assertEqual(self.client.get(f'/api/archive/health?profile_id={self.other}').json()['missing_originals'], 0)
        status.write_text(json.dumps({'last_success': '2026-11-01T03:00:00+00:00', 'status': 'failed', 'secret': 'do not expose'}))
        result = self.client.get('/api/archive/health').json()
        self.assertEqual(result['backup']['status'], 'failed')
        self.assertNotIn('secret', result['backup'])
        status.write_text('bad json')
        self.assertEqual(self.client.get('/api/archive/health').json()['backup']['status'], 'unknown')

    def test_export_sampling_uses_calendar_buckets_and_date_range(self):
        from datetime import datetime
        from backend.app.models import Image
        from backend.app.routers import video
        ids = [self.upload(1, name)['id'] for name in ('face_1.jpg', 'face_2.jpg', 'face_3.jpg')]
        with self.sessions() as db:
            for number, image_id in enumerate(ids):
                photo = db.get(Image, image_id)
                photo.photo_taken_at = datetime(2026, 11, 2 if number < 2 else 9, 10 + number)
                photo.aligned_path = photo.original_path
                photo.face_detected = True
                photo.included_in_video = True
                photo.align_attempted = True
            db.commit()
        with patch.object(video, '_start_job', return_value={'status': 'running'}) as start:
            response = self.client.post('/api/video/generate?sampling=week&date_from=2026-11-01&date_to=2026-11-30')
            self.assertEqual(response.status_code, 202)
            self.assertEqual([p['id'] for p in start.call_args.args[0]], [ids[0], ids[2]])
            self.client.post('/api/video/generate?sampling=month')
            self.assertEqual([p['id'] for p in start.call_args.args[0]], [ids[0]])
            self.assertEqual(self.client.post('/api/video/generate?date_from=2026-12-01&date_to=2026-01-01').status_code, 422)
            self.assertEqual(self.client.post('/api/video/generate?sampling=bad').status_code, 422)

    def test_trash_migration_preserves_existing_rows_and_is_idempotent(self):
        migration = importlib.import_module('migrations.009_add_trash')
        with tempfile.TemporaryDirectory() as directory:
            engine = create_engine(f'sqlite:///{directory}/old.db')
            with engine.connect() as conn:
                conn.execute(text('CREATE TABLE images(id INTEGER PRIMARY KEY, profile_id INTEGER, original_path TEXT)'))
                conn.execute(text("INSERT INTO images(id, profile_id, original_path) VALUES (:id, 1, :path)"),
                             [{'id': i, 'path': f'/originals/{i}.jpg'} for i in range(1, 1046)])
                conn.commit()
                migration.up(conn)
                migration.up(conn)
                self.assertEqual(conn.execute(text('SELECT count(*) FROM images WHERE deleted_at IS NULL')).scalar(), 1045)
                self.assertEqual(conn.execute(text('PRAGMA integrity_check')).scalar(), 'ok')
            engine.dispose()
