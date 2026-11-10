#!/usr/bin/env bash
# Starts an isolated backend+frontend for e2e tests.
# Uses a temporary data directory so real data is never touched.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export FACE_LAPSE_DATA_DIR="$PROJECT_ROOT/e2e/.test-data"
E2E_LOG_DIR="$PROJECT_ROOT/e2e/.e2e-server-logs"
mkdir -p "$FACE_LAPSE_DATA_DIR" "$E2E_LOG_DIR"

BACKEND_LOG="$E2E_LOG_DIR/backend.log"
FRONTEND_LOG="$E2E_LOG_DIR/frontend.log"
: >"$BACKEND_LOG"
: >"$FRONTEND_LOG"

# Start backend on port 8111 (no pipeline — a `uvicorn | grep` pipe can make `grep` exit 1 when
# every line is filtered, which breaks `wait` under `set -e` and kills the webServer process.)
cd "$PROJECT_ROOT"
source .venv/bin/activate
export GLOG_minloglevel=2 2>/dev/null || true
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8111 >>"$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# Wait for backend to be ready (health check). CI runners (GitHub sets CI=true) can be slow to
# import MediaPipe, run migrations, etc.
MAX_WAIT=30
if [ -n "${CI:-}" ]; then
  MAX_WAIT=120
fi

echo "Waiting for backend to start (up to ${MAX_WAIT}s)..."
for i in $(seq 1 "$MAX_WAIT"); do
  if curl -sS --connect-timeout 2 --max-time 5 http://127.0.0.1:8111/api/images -o /dev/null 2>/dev/null; then
    echo "Backend is ready"
    break
  fi
  if [ "$i" -eq "$MAX_WAIT" ]; then
    echo "Backend failed to start within ${MAX_WAIT} seconds. Last lines of ${BACKEND_LOG}:"
    tail -n 80 "$BACKEND_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

# Start frontend on port 5111, proxying to the test backend
cd "$PROJECT_ROOT/frontend"
VITE_API_PORT=8111 npx vite --port 5111 --strictPort >>"$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

# Vite must listen before Playwright's port probe succeeds; confirm with HTTP.
FRONTEND_WAIT=60
echo "Waiting for frontend (up to ${FRONTEND_WAIT}s)..."
for i in $(seq 1 "$FRONTEND_WAIT"); do
  if curl -sS --connect-timeout 2 --max-time 5 http://127.0.0.1:5111/ -o /dev/null 2>/dev/null; then
    echo "Frontend is ready"
    break
  fi
  if [ "$i" -eq "$FRONTEND_WAIT" ]; then
    echo "Frontend failed to start within ${FRONTEND_WAIT} seconds. Last lines of ${FRONTEND_LOG}:"
    tail -n 80 "$FRONTEND_LOG" >&2 || true
    exit 1
  fi
  sleep 1
done

cleanup() {
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  pkill -f "uvicorn.*8111" 2>/dev/null || true
  rm -rf "$FACE_LAPSE_DATA_DIR"
}
trap cleanup EXIT

wait
