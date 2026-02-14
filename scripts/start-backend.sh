#!/usr/bin/env bash
set -e

cd "$(dirname "$0")/.."

# Kill any existing backend on port 8000
kill $(lsof -ti:8000) 2>/dev/null && sleep 1 || true

source .venv/bin/activate
cd backend
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
