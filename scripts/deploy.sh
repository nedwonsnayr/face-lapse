#!/usr/bin/env bash
# Deploy the current working tree to the server and rebuild.
# Usage: FACE_LAPSE_HOST=ubuntu@<server-ip> ./scripts/deploy.sh
# Never touches data/ or .env on the server.
set -euo pipefail

HOST="${FACE_LAPSE_HOST:?Set FACE_LAPSE_HOST, e.g. ubuntu@203.0.113.10}"
cd "$(dirname "$0")/.."

echo "==> Syncing code to $HOST"
rsync -az --delete \
  --exclude .git --exclude data --exclude .env --exclude .venv \
  --exclude node_modules --exclude frontend/dist --exclude e2e \
  --exclude '*.gif' --exclude .DS_Store \
  ./ "$HOST:face-lapse/"

echo "==> Building and restarting"
ssh "$HOST" 'cd face-lapse && docker compose up -d --build && docker image prune -f >/dev/null'

echo "==> Waiting for health"
ssh "$HOST" 'for i in $(seq 1 60); do docker compose -f face-lapse/docker-compose.yml exec -T app curl -fs http://127.0.0.1:8000/api/health 2>/dev/null && exit 0; sleep 2; done; exit 1'
echo
echo "Deployed $(git rev-parse --short HEAD)$(git diff --quiet || echo ' (+uncommitted changes)')"
