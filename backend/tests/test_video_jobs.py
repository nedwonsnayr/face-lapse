"""Job reuse, input invalidation and bounded admission without real user data."""
from datetime import datetime
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


class VideoJobTests(unittest.TestCase):
    def setUp(self):
        from backend.app.routers import video
        self.video = video
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.source = self.root / 'source.jpg'
        self.source.write_bytes(b'original')
        self.metadata = [{'id': 1, 'path': str(self.source), 'revision': 'v1', 'date': datetime(2020, 8, 19), 'age': 24}]
        self.patches = [patch.object(video, '_jobs', {}), patch.object(video, 'VIDEOS_DIR', self.root), patch.object(video.threading, 'Thread')]
        self.mocks = [p.start() for p in self.patches]

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def start(self, metadata=None, duration=.05, dates=True, age=True):
        return self.video._start_job(metadata or self.metadata, duration, dates, age)

    def finish(self, job, fail=False):
        output = self.root / 'result.mp4'
        output.write_bytes(b'video')
        with patch.object(self.video, 'generate_video', return_value=None if fail else str(output)):
            self.video._run_job(job['job_id'], self.metadata, .05, True, True)

    def test_identical_running_and_completed_jobs_are_reused(self):
        job = self.start()
        self.assertEqual(self.start()['job_id'], job['job_id'])
        self.assertNotIn('_key', job)
        self.finish(job)
        reused = self.start()
        self.assertEqual(reused['job_id'], job['job_id'])
        self.assertEqual(reused['status'], 'done')
        self.mocks[-1].assert_called_once()
        self.assertNotIn('_key', self.video.get_job(job['job_id']))

    def test_concurrent_different_options_are_rejected(self):
        from fastapi import HTTPException
        self.start()
        with self.assertRaises(HTTPException) as caught:
            self.start(duration=.1)
        self.assertEqual(caught.exception.status_code, 409)
        self.assertEqual(len(self.video._jobs), 1)

    def test_key_covers_order_inclusion_revision_caption_speed_and_source(self):
        key = self.video._export_key
        base = key(self.metadata, .05, True, True)
        second = dict(self.metadata[0], id=2)
        cases = [([dict(self.metadata[0], revision='v2')], .05, True, True),
                 ([dict(self.metadata[0], date=datetime(2021, 1, 1))], .05, True, True),
                 ([dict(self.metadata[0], age=25)], .05, True, True),
                 (self.metadata, .1, True, True), (self.metadata, .05, False, True),
                 (self.metadata, .05, True, False), (self.metadata + [second], .05, True, True)]
        for args in cases:
            self.assertNotEqual(base, key(*args))
        self.assertNotEqual(key(self.metadata + [second], .05, True, True), key([second] + self.metadata, .05, True, True))
        self.assertEqual(key(self.metadata, .05, False, False), key([dict(self.metadata[0], age=99, date=None)], .05, False, False))
        self.source.write_bytes(b'changed source')
        self.assertNotEqual(base, key(self.metadata, .05, True, True))

    def test_key_covers_the_filter_and_treats_identity_as_none(self):
        from backend.app.services.filters import FilterDefinition
        base = {"version": 1, "brightness": 1, "contrast": 1, "saturation": 1, "grayscale": 0, "warmth": 0, "hue": 0,
                "fade": 0, "tint": {"color": "#ffffff", "blend": "soft-light", "strength": 0},
                "vignette": {"strength": 0, "size": .5}, "grain": {"amount": 0, "size": .5}}
        key = self.video._export_key
        plain = key(self.metadata, .05, True, True)
        self.assertEqual(plain, key(self.metadata, .05, True, True, FilterDefinition.model_validate(base)))
        mono = key(self.metadata, .05, True, True, FilterDefinition.model_validate({**base, "grayscale": 1}))
        grain = key(self.metadata, .05, True, True, FilterDefinition.model_validate({**base, "grain": {"amount": .5, "size": .5}}))
        self.assertEqual(len({plain, mono, grain}), 3)

    def test_failed_missing_and_mutated_results_are_not_reused(self):
        job = self.start()
        self.finish(job, fail=True)
        retry = self.start()
        self.assertNotEqual(retry['job_id'], job['job_id'])
        self.finish(retry)
        (self.root / 'result.mp4').unlink()
        retry2 = self.start()
        self.assertNotEqual(retry2['job_id'], retry['job_id'])
        self.source.write_bytes(b'new content while rendering')
        self.finish(retry2)
        self.assertIsNone(self.video._jobs[retry2['job_id']]['_key'])
        self.assertNotEqual(self.start()['job_id'], retry2['job_id'])

    def test_progress_and_registry_bound(self):
        with patch.object(self.video, '_MAX_JOBS', 2):
            for _ in range(4):
                job = self.start()
                def generate(*args, on_progress, **kwargs):
                    on_progress('rendering', 1, 1)
                    self.assertEqual(self.video.get_job(job['job_id'])['completed_frames'], 1)
                    on_progress('encoding', 1, 1)
                    self.assertEqual(self.video.get_job(job['job_id'])['phase'], 'encoding')
                    return None
                with patch.object(self.video, 'generate_video', side_effect=generate):
                    self.video._run_job(job['job_id'], self.metadata, .05, True, True)
            self.assertEqual(len(self.video._jobs), 2)

    def test_thread_start_failure_releases_admission(self):
        self.mocks[-1].return_value.start.side_effect = RuntimeError('thread unavailable')
        with self.assertRaises(RuntimeError):
            self.start()
        self.assertEqual(self.video._jobs, {})
