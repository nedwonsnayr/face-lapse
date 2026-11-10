#!/usr/bin/env python3
"""Record non-secret backup status atomically for the owner's archive health UI."""
import json
import os
from pathlib import Path
import sys
import tempfile
from datetime import datetime, timezone


def record(path: Path, status: str):
    if status not in {'running', 'success', 'failed'}:
        raise ValueError('Invalid status')
    try:
        old = json.loads(path.read_text())
    except (OSError, ValueError):
        old = {}
    if not isinstance(old, dict):
        old = {}
    now = datetime.now(timezone.utc).isoformat()
    data = {'status': status, 'last_attempt': now if status == 'running' else old.get('last_attempt', now),
            'last_success': now if status == 'success' else old.get('last_success')}
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.backup-status-')
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(data, out)
        os.chmod(tmp, 0o644)  # app UID can read the root cron's non-secret status
        os.replace(tmp, path)
    finally:
        Path(tmp).unlink(missing_ok=True)


if __name__ == '__main__':
    record(Path(sys.argv[1]), sys.argv[2])
