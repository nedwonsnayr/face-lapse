"""Nightly storage numbers, the storage alert verdict and the CLI that backup.sh calls."""
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from types import SimpleNamespace
from unittest.mock import patch

SCRIPT = Path(__file__).parents[2] / 'scripts/backup-status.py'
spec = importlib.util.spec_from_file_location('backup_status', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


def fake_restic(raw_size=4_240_000_000, set_size=4_250_000_000, fail=()):
    calls = []

    def run(command, **kwargs):
        calls.append(command)
        assert command[:2] == ['restic', 'stats'] and '--json' in command
        key = 'raw' if '--mode' in command else 'latest'
        if key in fail:
            return SimpleNamespace(returncode=1, stdout='', stderr='repository is locked')
        size = raw_size if key == 'raw' else set_size
        return SimpleNamespace(returncode=0, stdout=json.dumps({'total_size': size, 'total_file_count': 3}), stderr='')
    run.calls = calls
    return run


class StorageMeasureTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.data = Path(self.temp.name)
        (self.data / 'videos').mkdir()
        (self.data / 'videos' / 'a.mp4').write_bytes(b'x' * 1000)
        (self.data / 'videos' / 'b.mp4').write_bytes(b'x' * 500)
        self.status = self.data / 'backup-status.json'

    def tearDown(self):
        self.temp.cleanup()

    def test_measure_reads_restic_disk_and_videos(self):
        run = fake_restic()
        values = module.measure(self.data, run=run)
        self.assertEqual(values['repo_bytes'], 4_240_000_000)
        self.assertEqual(values['backup_set_bytes'], 4_250_000_000)
        self.assertEqual(values['videos_bytes'], 1500)
        self.assertTrue(0 <= values['disk_used_pct'] <= 100)
        self.assertGreater(values['disk_free_bytes'], 0)
        self.assertIn('+00:00', values['measured_at'])
        self.assertIn(['restic', 'stats', '--mode', 'raw-data', '--json'], run.calls)
        self.assertIn(['restic', 'stats', 'latest', '--json'], run.calls)

    def test_disk_percent_matches_df_formula(self):
        usage = SimpleNamespace(total=100, used=19, free=78)  # 3 reserved for root, as on ext4
        with patch.object(module.shutil, 'disk_usage', return_value=usage):
            self.assertEqual(module._disk(self.data), (19.6, 78))

    def test_failed_measurements_are_none_not_stale_and_never_raise(self):
        values = module.measure(self.data, run=fake_restic(fail=('raw',)))
        self.assertIsNone(values['repo_bytes'])
        self.assertEqual(values['backup_set_bytes'], 4_250_000_000)
        def missing(*args, **kwargs):
            raise FileNotFoundError('restic')
        values = module.measure(self.data / 'nowhere', run=missing)
        self.assertEqual((values['repo_bytes'], values['backup_set_bytes'], values['disk_used_pct'], values['videos_bytes']),
                         (None, None, None, 0))

    def test_garbage_restic_output_is_none(self):
        run = lambda command, **kwargs: SimpleNamespace(returncode=0, stdout='{"total_size": "big"}', stderr='')
        self.assertIsNone(module._restic_total_size(['latest'], run))
        run = lambda command, **kwargs: SimpleNamespace(returncode=0, stdout='not json', stderr='')
        self.assertIsNone(module._restic_total_size(['latest'], run))

    def test_videos_size_does_not_follow_symlinks(self):
        outside = self.data / 'outside.bin'
        outside.write_bytes(b'x' * 9999)
        (self.data / 'videos' / 'link.mp4').symlink_to(outside)
        self.assertEqual(module._tree_bytes(self.data / 'videos'), 1500)

    def test_record_storage_keeps_state_and_run_updates_keep_storage(self):
        module.record(self.status, 'running')
        module.record(self.status, 'success')
        success = json.loads(self.status.read_text())['last_success']
        module.record_storage(self.status, module.measure(self.data, run=fake_restic()))
        saved = json.loads(self.status.read_text())
        self.assertEqual((saved['status'], saved['last_success']), ('success', success))
        self.assertEqual(saved['repo_bytes'], 4_240_000_000)
        module.record(self.status, 'running')
        module.record(self.status, 'failed')
        saved = json.loads(self.status.read_text())
        self.assertEqual((saved['status'], saved['last_success'], saved['repo_bytes']), ('failed', success, 4_240_000_000))
        self.assertEqual(self.status.stat().st_mode & 0o777, 0o644)
        self.assertEqual(list(self.data.glob('.backup-status-*')), [])

    def test_status_file_holds_no_unexpected_keys(self):
        module.record(self.status, 'success')
        module.record_storage(self.status, dict(module.measure(self.data, run=fake_restic()), RESTIC_PASSWORD='nope'))
        self.assertEqual(set(json.loads(self.status.read_text())),
                         {'status', 'last_attempt', 'last_success', *module.STORAGE_KEYS})


class StorageVerdictTests(unittest.TestCase):
    def test_thresholds(self):
        verdict = module.storage_verdict
        self.assertEqual(verdict({'repo_bytes': 7_999_999_999, 'disk_used_pct': 79.9}), 'ok')
        self.assertEqual(verdict({'repo_bytes': 8_000_000_000, 'disk_used_pct': 10}), 'fail')
        self.assertEqual(verdict({'repo_bytes': 1, 'disk_used_pct': 80}), 'fail')
        self.assertEqual(verdict({'repo_bytes': 1, 'disk_used_pct': 10}, repo_limit=1), 'fail')
        self.assertEqual(verdict({'repo_bytes': 5, 'disk_used_pct': 10}, repo_limit=6, disk_limit=10), 'fail')

    def test_unknown_unless_over_a_limit(self):
        verdict = module.storage_verdict
        self.assertEqual(verdict({}), 'unknown')
        self.assertEqual(verdict({'repo_bytes': 1}), 'unknown')
        self.assertEqual(verdict({'repo_bytes': None, 'disk_used_pct': 10}), 'unknown')
        self.assertEqual(verdict({'repo_bytes': True, 'disk_used_pct': 'x'}), 'unknown')
        self.assertEqual(verdict({'repo_bytes': 9_000_000_000}), 'fail')  # over is over, even half-measured


class StorageCliTests(unittest.TestCase):
    def run_cli(self, *args, env=None):
        environment = {k: v for k, v in os.environ.items() if not k.startswith('STORAGE_')}
        environment.update(env or {})
        return subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True, env=environment)

    def test_alert_command_uses_env_thresholds_and_ignores_bad_ones(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup-status.json'
            path.write_text(json.dumps({'repo_bytes': 5_000_000_000, 'disk_used_pct': 19}))
            self.assertEqual(self.run_cli(str(path), 'alert').stdout.strip(), 'ok')
            self.assertEqual(self.run_cli(str(path), 'alert', env={'STORAGE_ALERT_REPO_BYTES': '4000000000'}).stdout.strip(), 'fail')
            self.assertEqual(self.run_cli(str(path), 'alert', env={'STORAGE_ALERT_DISK_PCT': '19'}).stdout.strip(), 'fail')
            bad = self.run_cli(str(path), 'alert', env={'STORAGE_ALERT_REPO_BYTES': 'lots', 'STORAGE_ALERT_DISK_PCT': '-3'})
            self.assertEqual(bad.stdout.strip(), 'ok')
            self.assertIn('Ignoring invalid', bad.stderr)
            path.write_text('[]')
            self.assertEqual(self.run_cli(str(path), 'alert').stdout.strip(), 'unknown')
            self.assertEqual(self.run_cli(str(Path(directory) / 'missing.json'), 'alert').stdout.strip(), 'unknown')

    def test_status_command_still_works(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup-status.json'
            self.assertEqual(self.run_cli(str(path), 'running').returncode, 0)
            self.assertEqual(json.loads(path.read_text())['status'], 'running')
            self.assertNotEqual(self.run_cli(str(path), 'bogus').returncode, 0)

    def test_measure_command_without_restic_still_records_what_it_can(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup-status.json'
            (Path(directory) / 'videos').mkdir()
            (Path(directory) / 'videos' / 'a.mp4').write_bytes(b'x' * 10)
            result = self.run_cli(str(path), 'measure', directory, env={'PATH': '/nonexistent'})
            self.assertEqual(result.returncode, 0, result.stderr)
            saved = json.loads(path.read_text())
            self.assertIsNone(saved['repo_bytes'])
            self.assertEqual(saved['videos_bytes'], 10)
            self.assertIsNotNone(saved['disk_used_pct'])


if __name__ == '__main__':
    unittest.main()
