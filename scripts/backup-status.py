#!/usr/bin/env python3
"""Record non-secret backup status atomically for the owner's archive health UI.

Usage (all paths are to data/backup-status.json):
  backup-status.py PATH running|success|failed   record the run state
  backup-status.py PATH measure [DATA_DIR]       measure storage and merge the numbers into the file
  backup-status.py PATH alert                    print ok|fail|unknown for the storage thresholds

The file only ever holds times, states and byte counts. Never put credentials in it.
"""
import json
import os
from pathlib import Path
import shutil
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

# Storage numbers written by `measure`. They survive running/failed updates, so the UI always
# shows the latest measurement, and `measured_at` says how old it is.
STORAGE_KEYS = ('repo_bytes', 'backup_set_bytes', 'disk_used_pct', 'disk_free_bytes', 'videos_bytes', 'measured_at')

DEFAULT_ALERT_REPO_BYTES = 8_000_000_000  # 80% of B2's 10 GB free tier
DEFAULT_ALERT_DISK_PCT = 80.0
RESTIC_TIMEOUT_SECONDS = 300


def _load(path: Path) -> dict:
    try:
        old = json.loads(path.read_text())
    except (OSError, ValueError):
        return {}
    return old if isinstance(old, dict) else {}


def _write(path: Path, data: dict) -> None:
    fd, tmp = tempfile.mkstemp(dir=path.parent, prefix='.backup-status-')
    try:
        with os.fdopen(fd, 'w') as out:
            json.dump(data, out)
        os.chmod(tmp, 0o644)  # app UID can read the root cron's non-secret status
        os.replace(tmp, path)
    finally:
        Path(tmp).unlink(missing_ok=True)


def record(path: Path, status: str):
    if status not in {'running', 'success', 'failed'}:
        raise ValueError('Invalid status')
    old = _load(path)
    now = datetime.now(timezone.utc).isoformat()
    data = {'status': status, 'last_attempt': now if status == 'running' else old.get('last_attempt', now),
            'last_success': now if status == 'success' else old.get('last_success')}
    data.update({key: old[key] for key in STORAGE_KEYS if key in old})
    _write(path, data)


def _restic_total_size(args, run):
    """`total_size` from a `restic stats --json` call, or None if restic fails or answers oddly."""
    try:
        result = run(['restic', 'stats', *args, '--json'], capture_output=True, text=True,
                     timeout=RESTIC_TIMEOUT_SECONDS)
        if result.returncode != 0:
            print('restic stats failed: ' + (result.stderr or '').strip()[-200:], file=sys.stderr)
            return None
        size = json.loads(result.stdout)['total_size']
        return size if isinstance(size, int) and not isinstance(size, bool) and size >= 0 else None
    except (OSError, ValueError, KeyError, TypeError, subprocess.SubprocessError) as error:
        print(f'restic stats failed: {error.__class__.__name__}', file=sys.stderr)
        return None


def _disk(data_dir: Path):
    """(used percent, free bytes) as `df` reports them: used / (used + available)."""
    try:
        usage = shutil.disk_usage(data_dir)
        used_and_available = usage.used + usage.free
        if used_and_available <= 0:
            return None, None
        return round(usage.used / used_and_available * 100, 1), usage.free
    except OSError as error:
        print(f'Could not measure disk: {error.__class__.__name__}', file=sys.stderr)
        return None, None


def _tree_bytes(directory: Path):
    """Total apparent size of regular files under directory. Symlinks are not followed."""
    if not directory.is_dir():
        return 0
    total = 0
    try:
        for root, _dirs, files in os.walk(directory, followlinks=False):
            for name in files:
                try:
                    info = os.lstat(os.path.join(root, name))
                except OSError:
                    continue  # removed while we walk (the app's retention sweep)
                if stat.S_ISREG(info.st_mode):
                    total += info.st_size
    except OSError as error:
        print(f'Could not measure videos: {error.__class__.__name__}', file=sys.stderr)
        return None
    return total


def measure(data_dir: Path, run=subprocess.run) -> dict:
    """Storage numbers for one nightly run. A number that cannot be measured is None, never stale.

    repo_bytes        what B2 stores: `restic stats --mode raw-data` (de-duplicated pack bytes).
    backup_set_bytes  size of the latest snapshot's files: `restic stats latest` (restore-size).
    disk_used_pct     used share of the filesystem holding data/, as `df` computes it.
    disk_free_bytes   bytes available to the app on that filesystem.
    videos_bytes      size of data/videos (exported MP4s, not backed up).
    """
    used_pct, free = _disk(data_dir)
    return {
        'repo_bytes': _restic_total_size(['--mode', 'raw-data'], run),
        'backup_set_bytes': _restic_total_size(['latest'], run),
        'disk_used_pct': used_pct,
        'disk_free_bytes': free,
        'videos_bytes': _tree_bytes(data_dir / 'videos'),
        'measured_at': datetime.now(timezone.utc).isoformat(),
    }


def record_storage(path: Path, values: dict):
    """Merge storage numbers into the status file without touching the run state."""
    data = _load(path)
    data.update({key: values.get(key) for key in STORAGE_KEYS})
    _write(path, data)


def _number(value):
    return value if isinstance(value, (int, float)) and not isinstance(value, bool) else None


def storage_verdict(status: dict, repo_limit=DEFAULT_ALERT_REPO_BYTES, disk_limit=DEFAULT_ALERT_DISK_PCT) -> str:
    """'fail' when either number is at or over its limit, 'ok' when both are known and under,
    'unknown' otherwise. Unknown means: do not ping, so a broken measurement ends in the
    healthchecks.io missed-ping email instead of a false all-clear."""
    repo, disk = _number(status.get('repo_bytes')), _number(status.get('disk_used_pct'))
    if (repo is not None and repo >= repo_limit) or (disk is not None and disk >= disk_limit):
        return 'fail'
    return 'ok' if repo is not None and disk is not None else 'unknown'


def _env_number(name: str, default):
    raw = os.environ.get(name, '').strip()
    if not raw:
        return default
    try:
        value = float(raw)
    except ValueError:
        value = -1
    if value <= 0:
        print(f'Ignoring invalid {name}; using {default}', file=sys.stderr)
        return default
    return value


def main(argv) -> int:
    path, action = Path(argv[1]), argv[2]
    if action == 'measure':
        values = measure(Path(argv[3]) if len(argv) > 3 else path.parent)
        record_storage(path, values)
        print(json.dumps({key: values[key] for key in STORAGE_KEYS}))
    elif action == 'alert':
        verdict = storage_verdict(_load(path), _env_number('STORAGE_ALERT_REPO_BYTES', DEFAULT_ALERT_REPO_BYTES),
                                  _env_number('STORAGE_ALERT_DISK_PCT', DEFAULT_ALERT_DISK_PCT))
        print(verdict)
    else:
        record(path, action)
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv))
