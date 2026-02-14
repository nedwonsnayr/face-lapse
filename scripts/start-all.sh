#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(dirname "$0")"

echo "Starting backend..."
"$SCRIPT_DIR/start-backend.sh" &
BACKEND_PID=$!

echo "Starting frontend..."
"$SCRIPT_DIR/start-frontend.sh" &
FRONTEND_PID=$!

echo ""
echo "Backend running on http://localhost:8000 (PID $BACKEND_PID)"
echo "Frontend running on http://localhost:5173 (PID $FRONTEND_PID)"
echo ""
echo "Press Ctrl+C to stop both."

trap "kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" INT TERM
wait
