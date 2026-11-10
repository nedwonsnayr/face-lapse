import importlib.util
from pathlib import Path
import tempfile
import json
import unittest


class BackupStatusTests(unittest.TestCase):
    def test_atomic_status_preserves_last_success_through_failure(self):
        spec = importlib.util.spec_from_file_location('backup_status', Path(__file__).parents[2] / 'scripts/backup-status.py')
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'backup-status.json'
            module.record(path, 'running')
            self.assertIsNone(json.loads(path.read_text())['last_success'])
            module.record(path, 'success')
            success = json.loads(path.read_text())['last_success']
            module.record(path, 'running')
            module.record(path, 'failed')
            status = json.loads(path.read_text())
            self.assertEqual(status['last_success'], success)
            self.assertEqual(status['status'], 'failed')
            self.assertEqual(path.stat().st_mode & 0o777, 0o644)
            self.assertEqual(list(Path(directory).glob('.backup-status-*')), [])
