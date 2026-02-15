#!/usr/bin/env bash
# Starts an isolated backend+frontend for e2e tests.
# Uses a temporary data directory so real data is never touched.
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

export FACE_LAPSE_DATA_DIR="$PROJECT_ROOT/e2e/.test-data"
mkdir -p "$FACE_LAPSE_DATA_DIR"

# Start backend on port 8111
cd "$PROJECT_ROOT"
source .venv/bin/activate
# Suppress MediaPipe warnings via environment variable (if supported)
export GLOG_minloglevel=2 2>/dev/null || true
uvicorn backend.app.main:app --host 127.0.0.1 --port 8111 2>&1 | grep -v "inference_feedback_manager\|Feedback manager\|W0000" &
BACKEND_PID=$!

# Start frontend on port 5111, proxying to the test backend
cd "$PROJECT_ROOT/frontend"
VITE_API_PORT=8111 npx vite --port 5111 --strictPort &
FRONTEND_PID=$!

# Cleanup on exit - kill the pipeline (grep) which will close uvicorn's stdout/stderr
trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; pkill -f 'uvicorn.*8111' 2>/dev/null; rm -rf '$FACE_LAPSE_DATA_DIR'" EXIT

wait
