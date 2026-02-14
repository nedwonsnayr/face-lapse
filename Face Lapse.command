#!/usr/bin/env bash
# ── Face Lapse ──────────────────────────────────────────────────
# Double-click to start. Close this window to stop.
# Drag to Dock for a quick-launch shortcut.
# ────────────────────────────────────────────────────────────────

cd "$(dirname "$0")"

# Kill anything already on our ports
kill $(lsof -ti:8000) 2>/dev/null || true
kill $(lsof -ti:5173) 2>/dev/null || true
sleep 0.5

# Start backend
source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
cd ..

# Start frontend
cd frontend
npm run dev -- --host 0.0.0.0 &
FRONTEND_PID=$!
cd ..

# Stop everything when this window is closed
cleanup() {
  echo ""
  echo "Stopping Face Lapse..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  kill $(lsof -ti:8000) 2>/dev/null || true
  kill $(lsof -ti:5173) 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM HUP EXIT

# Wait for frontend to be ready, then open browser
echo "Starting Face Lapse..."
for i in $(seq 1 30); do
  if curl -s http://localhost:5173 > /dev/null 2>&1; then
    open http://localhost:5173
    break
  fi
  sleep 0.5
done

echo ""
echo "┌─────────────────────────────────────┐"
echo "│  Face Lapse is running              │"
echo "│  http://localhost:5173              │"
echo "│                                     │"
echo "│  Close this window to stop.         │"
echo "└─────────────────────────────────────┘"
echo ""

wait
