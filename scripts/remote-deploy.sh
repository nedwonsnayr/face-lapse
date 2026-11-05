#!/usr/bin/env bash
# Server-side deploy entry point for the GitHub Actions workflow.
#
# The workflow's SSH key is pinned to this script in ~/.ssh/authorized_keys:
#   command="/home/ubuntu/face-lapse/scripts/remote-deploy.sh",restrict ssh-ed25519 AAAA... gh-deploy
# so that key can do exactly one thing: deploy a commit that exists on GitHub.
# Usage (what the workflow sends): ssh <host> deploy <40-char commit sha>
set -euo pipefail

# Everything runs inside main() so bash has parsed the whole script before
# `git checkout` replaces this file on disk.
main() {
  local request="${SSH_ORIGINAL_COMMAND:-$*}"
  local ref="${request#deploy }"
  if [[ ! "$ref" =~ ^[0-9a-f]{40}$ ]]; then
    echo "usage: deploy <40-char commit sha>" >&2
    exit 2
  fi

  cd "$(dirname "$(readlink -f "$0")")/.."
  git fetch --quiet origin
  if ! git cat-file -e "${ref}^{commit}" 2>/dev/null; then
    echo "commit $ref not found on origin" >&2
    exit 2
  fi

  echo "==> Checking out $ref"
  # data/ and .env are git-ignored, so --force never touches them.
  git checkout --quiet --force --detach "$ref"

  echo "==> Building and restarting"
  docker compose up -d --build
  docker image prune -f >/dev/null

  echo "==> Waiting for health"
  for _ in $(seq 1 60); do
    if docker compose exec -T app curl -fsS http://127.0.0.1:8000/api/health >/dev/null 2>&1; then
      echo "Deployed $ref"
      exit 0
    fi
    sleep 2
  done
  echo "App did not become healthy; recent logs:" >&2
  docker compose logs --tail 50 app >&2
  exit 1
}

main "$@"
