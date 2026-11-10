#!/usr/bin/env bash
# Nightly encrypted backup of Face Lapse data to Backblaze B2 via restic.
# Runs as root from cron (see server-setup.sh). Needs RESTIC_* and B2_* in .env.
# Videos and thumbs are excluded: both are regenerated from the aligned images.
set -euo pipefail

APP_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DATA="$APP_DIR/data"
set -a; source "$APP_DIR/.env"; set +a

ping() { [ -n "${HEALTHCHECK_URL:-}" ] && curl -fsS -m 10 --retry 3 "$HEALTHCHECK_URL$1" >/dev/null || true; }
status() { python3 "$APP_DIR/scripts/backup-status.py" "$DATA/backup-status.json" "$1"; }
trap 'status failed; ping /fail' ERR
status running
ping /start

# Consistent SQLite snapshot (safe while the app is running).
mkdir -p "$DATA/.backup"
sqlite3 "$DATA/face_lapse.db" ".backup '$DATA/.backup/face_lapse.db'"

# First run: create the repository.
restic cat config >/dev/null 2>&1 || restic init

restic backup "$DATA" \
  --exclude "$DATA/videos" \
  --exclude "$DATA/thumbs" \
  --exclude "$DATA/face_lapse.db" \
  --exclude "$DATA/face_lapse.db-*" \
  --tag nightly

restic forget --keep-daily 7 --keep-weekly 4 --keep-monthly 6 --prune
# Spot-check 5% of stored data each night.
restic check --read-data-subset=5%

status success
ping ""
echo "$(date -Is) backup ok"
