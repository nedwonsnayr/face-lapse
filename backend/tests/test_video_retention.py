"""Exported MP4s expire after VIDEO_RETENTION_DAYS without touching anything else."""
import asyncio
import os
from pathlib import Path
import tempfile
import time
import unittest
from unittest.mock import patch

from backend.app.services import retention

DAY = 86400


class SweepTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.root = Path(self.temp.name)
        self.videos = self.root / 'videos'
        self.videos.mkdir()

    def tearDown(self):
        self.temp.cleanup()

    def make(self, directory, name, days_old):
        path = directory / name
        path.write_bytes(b'video')
        stamp = time.time() - days_old * DAY
        os.utime(path, (stamp, stamp))
        return path

    def test_old_deleted_new_and_other_files_kept(self):
        old = self.make(self.videos, 'timelapse_old.mp4', 8)
        person = self.make(self.videos, 'person-2-timelapse_old.mp4', 30)
        new = self.make(self.videos, 'timelapse_new.mp4', 6)
        text = self.make(self.videos, 'notes.txt', 90)
        upper = self.make(self.videos, 'OLD.MP4', 90)
        nested = self.videos / 'nested'
        nested.mkdir()
        inner = self.make(nested, 'timelapse_inner.mp4', 90)
        self.assertEqual(retention.sweep_videos(self.videos, 7), 2)
        self.assertFalse(old.exists() or person.exists())
        self.assertTrue(all(p.exists() for p in (new, text, upper, inner)))

    def test_protected_names_kept(self):
        owned = self.make(self.videos, 'timelapse_owned.mp4', 30)
        other = self.make(self.videos, 'timelapse_other.mp4', 30)
        self.assertEqual(retention.sweep_videos(self.videos, 7, protected={'timelapse_owned.mp4'}), 1)
        self.assertTrue(owned.exists())
        self.assertFalse(other.exists())

    def test_files_outside_the_dir_and_symlinks_are_never_touched(self):
        outside = self.make(self.root, 'precious.mp4', 90)
        link = self.videos / 'timelapse_link.mp4'
        link.symlink_to(outside)
        folder_link = self.videos / 'folder.mp4'
        folder_link.symlink_to(self.root, target_is_directory=True)
        sibling = self.make(self.root, 'timelapse_sibling.mp4', 90)
        self.assertEqual(retention.sweep_videos(self.videos, 7), 0)
        self.assertTrue(outside.exists() and sibling.exists())
        self.assertTrue(link.is_symlink() and folder_link.is_symlink())

    def test_symlinked_videos_dir_target_files_are_deleted_only_inside_it(self):
        # videos/ itself may be a symlink (operator choice): its own mp4s still expire.
        real = self.root / 'real'
        real.mkdir()
        old = self.make(real, 'timelapse_old.mp4', 30)
        alias = self.root / 'alias'
        alias.symlink_to(real, target_is_directory=True)
        self.assertEqual(retention.sweep_videos(alias, 7), 1)
        self.assertFalse(old.exists())

    def test_missing_dir_and_disabled_retention(self):
        self.assertEqual(retention.sweep_videos(self.root / 'nope', 7), 0)
        old = self.make(self.videos, 'timelapse_old.mp4', 400)
        self.assertEqual(retention.sweep_videos(self.videos, 0), 0)
        self.assertTrue(old.exists())

    def test_boundary_uses_now_argument(self):
        path = self.make(self.videos, 'timelapse_edge.mp4', 7)
        self.assertEqual(retention.sweep_videos(self.videos, 7, now=path.stat().st_mtime + 7 * DAY - 1), 0)
        self.assertEqual(retention.sweep_videos(self.videos, 7, now=path.stat().st_mtime + 7 * DAY + 1), 1)

    def test_loop_runs_immediately_repeats_and_survives_errors(self):
        calls = []

        def sweep():
            calls.append(1)
            if len(calls) == 1:
                raise RuntimeError('boom')
            return 1

        async def run():
            task = asyncio.create_task(retention.retention_loop(sweep, interval=0.01))
            await asyncio.sleep(0.2)
            task.cancel()
            with self.assertRaises(asyncio.CancelledError):
                await task
        with self.assertLogs('face-lapse.retention', level='INFO') as logs:
            asyncio.run(run())
        self.assertGreaterEqual(len(calls), 3)
        self.assertTrue(any('Video retention sweep failed' in line for line in logs.output))
        self.assertTrue(any('Deleted 1 expired' in line for line in logs.output))


class RouterSweepTests(unittest.TestCase):
    def setUp(self):
        from backend.app.routers import video
        self.video = video
        self.temp = tempfile.TemporaryDirectory()
        self.videos = Path(self.temp.name)
        self.patches = [patch.object(video, 'VIDEOS_DIR', self.videos), patch.object(video, '_jobs', {}),
                        patch.object(video, 'VIDEO_RETENTION_DAYS', 7)]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in reversed(self.patches):
            p.stop()
        self.temp.cleanup()

    def old_file(self, name='timelapse_old.mp4'):
        path = self.videos / name
        path.write_bytes(b'video')
        stamp = time.time() - 30 * DAY
        os.utime(path, (stamp, stamp))
        return path

    def test_deletes_when_idle_and_regenerates_completed_job_whose_file_expired(self):
        path = self.old_file()
        self.video._jobs['j'] = {'job_id': 'j', 'status': 'done', 'video_filename': path.name, '_key': 'k', '_profile_id': 1}
        with self.assertNoLogs('face-lapse.video', level='ERROR'):
            self.assertEqual(self.video.sweep_expired_videos(), 1)
        self.assertFalse(path.exists())

    def test_skips_everything_while_an_export_is_running(self):
        path = self.old_file()
        half_written = self.old_file('timelapse_encoding.mp4')
        self.video._jobs['j'] = {'job_id': 'j', 'status': 'running', 'video_filename': None, '_key': 'k', '_profile_id': 1}
        self.assertEqual(self.video.sweep_expired_videos(), 0)
        self.assertTrue(path.exists() and half_written.exists())
        self.video._jobs['j']['status'] = 'done'
        self.assertEqual(self.video.sweep_expired_videos(), 2)

    def test_expired_completed_job_is_not_reused(self):
        from datetime import datetime
        source = self.videos / 'source.jpg'
        source.write_bytes(b'original')
        metadata = [{'id': 1, 'path': str(source), 'revision': 'v1', 'date': datetime(2020, 1, 1), 'age': None}]
        key = self.video._export_key(metadata, .05, False, False)
        path = self.old_file()
        self.video._jobs['j'] = {'job_id': 'j', 'status': 'done', 'video_filename': path.name, '_key': key, '_profile_id': 1,
                                 'phase': 'done'}
        with patch.object(self.video.threading, 'Thread'):
            self.assertEqual(self.video._start_job(metadata, .05, False, False)['job_id'], 'j')
            self.video.sweep_expired_videos()
            fresh = self.video._start_job(metadata, .05, False, False)
        self.assertNotEqual(fresh['job_id'], 'j')
        self.assertEqual(fresh['status'], 'running')


if __name__ == '__main__':
    unittest.main()
