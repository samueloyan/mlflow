#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
DB="$ROOT/tensorlane-dev.db"
export DATABASE_URL="sqlite:///${DB}"
export TENSORLANE_PEPPER="${TENSORLANE_PEPPER:-dev-pepper-change-me}"
export TENSORLANE_SECRET_KEY="${TENSORLANE_SECRET_KEY:-dev-secret-change-me}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$TENSORLANE_SECRET_KEY}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:3000}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:8080}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:3000}"
export WEB_INTERNAL_URI="${WEB_INTERNAL_URI:-http://127.0.0.1:3000}"
export MLFLOW_INTERNAL_URI="${MLFLOW_INTERNAL_URI:-null://}"
export ARTIFACT_ROOT="${ARTIFACT_ROOT:-file:///tmp/tensorlane-artifacts}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3000}"
export NEXT_PUBLIC_TRACKING_URI="${NEXT_PUBLIC_TRACKING_URI:-http://localhost:8080}"
export TENSORLANE_API_ORIGIN="${TENSORLANE_API_ORIGIN:-http://127.0.0.1:8080}"

if [[ ! -x "$ROOT/.venv-tensorlane/bin/python" ]]; then
  echo "Create .venv-tensorlane and install tensorlane first. See tensorlane/README.md"
  exit 1
fi

"$ROOT/.venv-tensorlane/bin/tensorlane" serve --host 127.0.0.1 --port 8080 &
API_PID=$!
cleanup() {
  kill "$API_PID" 2>/dev/null || true
}
trap cleanup EXIT

(
  cd "$ROOT/tensorlane/web"
  if [[ ! -d node_modules ]]; then
    npm install --min-release-age=7
  fi
  npm run dev
)
