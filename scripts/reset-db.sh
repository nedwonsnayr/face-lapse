#!/usr/bin/env bash
# Reset the Face Lapse database and all image/video data
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$PROJECT_ROOT/data"

echo "⚠️  This will delete the database, all original images, aligned images, and videos."
read -p "Are you sure? (y/N) " confirm
if [[ "$confirm" != [yY] ]]; then
  echo "Cancelled."
  exit 0
fi

# Kill the backend so it doesn't hold a stale DB connection
kill $(lsof -ti:8000) 2>/dev/null && echo "Stopped running backend." || true

rm -f "$DATA_DIR/face_lapse.db"
find "$DATA_DIR/originals" "$DATA_DIR/aligned" "$DATA_DIR/videos" -type f -delete 2>/dev/null || true

echo "✅ Database and data files cleared. Run 'make start' to restart."
