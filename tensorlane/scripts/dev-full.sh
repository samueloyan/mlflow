#!/usr/bin/env bash
# Full local stack without Docker: MLflow (workspaces on) + gateway + Next.js.
# Unlike scripts/dev.sh, this does not stub the data plane with null://.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

MLFLOW_BIN="${MLFLOW_BIN:-$ROOT/.venv/bin/mlflow}"
TL_PY="${TL_PY:-$ROOT/.venv-tensorlane/bin/python}"
TL_BIN="${TL_BIN:-$ROOT/.venv-tensorlane/bin/tensorlane}"

if [[ ! -x "$MLFLOW_BIN" ]]; then
  echo "MLflow CLI not found at $MLFLOW_BIN"
  echo "Create the repo venv (uv sync) or set MLFLOW_BIN to an mlflow executable from this checkout."
  exit 1
fi
if [[ ! -x "$TL_BIN" ]]; then
  echo "Create .venv-tensorlane and install tensorlane first. See tensorlane/README.md"
  exit 1
fi

MLFLOW_PORT="${MLFLOW_PORT:-5000}"
API_PORT="${API_PORT:-8080}"
WEB_PORT="${WEB_PORT:-3000}"
MLFLOW_DIR="${MLFLOW_DIR:-$ROOT/.tensorlane-mlflow}"
mkdir -p "$MLFLOW_DIR/artifacts" /tmp/tensorlane-artifacts

DB="${DATABASE_URL:-sqlite:///${ROOT}/tensorlane-dev.db}"
export DATABASE_URL="$DB"
export TENSORLANE_PEPPER="${TENSORLANE_PEPPER:-dev-pepper-change-me}"
export TENSORLANE_SECRET_KEY="${TENSORLANE_SECRET_KEY:-dev-secret-change-me}"
export BETTER_AUTH_SECRET="${BETTER_AUTH_SECRET:-$TENSORLANE_SECRET_KEY}"
export BETTER_AUTH_URL="${BETTER_AUTH_URL:-http://localhost:${WEB_PORT}}"
export PUBLIC_URL="${PUBLIC_URL:-http://localhost:${API_PORT}}"
export WEB_ORIGIN="${WEB_ORIGIN:-http://localhost:${WEB_PORT}}"
export WEB_INTERNAL_URI="${WEB_INTERNAL_URI:-http://127.0.0.1:${WEB_PORT}}"
export MLFLOW_INTERNAL_URI="${MLFLOW_INTERNAL_URI:-http://127.0.0.1:${MLFLOW_PORT}}"
export MLFLOW_STATIC_PREFIX="${MLFLOW_STATIC_PREFIX:-/mlflow}"
export ARTIFACT_ROOT="${ARTIFACT_ROOT:-file:///tmp/tensorlane-artifacts}"
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:${WEB_PORT}}"
export NEXT_PUBLIC_TRACKING_URI="${NEXT_PUBLIC_TRACKING_URI:-http://localhost:${API_PORT}}"
export TENSORLANE_API_ORIGIN="${TENSORLANE_API_ORIGIN:-http://127.0.0.1:${API_PORT}}"
export CONTROL_PLANE_RPM="${CONTROL_PLANE_RPM:-0}"
export MLFLOW_WRITE_RPM="${MLFLOW_WRITE_RPM:-0}"

wait_http() {
  local url="$1"
  local name="$2"
  local i
  for i in $(seq 1 90); do
    if "$TL_PY" - "$url" <<'PY' >/dev/null 2>&1
import sys, urllib.request
urllib.request.urlopen(sys.argv[1], timeout=2)
PY
    then
      echo "$name is up: $url"
      return 0
    fi
    sleep 1
  done
  echo "Timed out waiting for $name at $url" >&2
  return 1
}

echo "Starting MLflow on 127.0.0.1:${MLFLOW_PORT} (workspaces on, static prefix ${MLFLOW_STATIC_PREFIX})"
"$MLFLOW_BIN" server \
  --backend-store-uri "sqlite:///${MLFLOW_DIR}/mlflow.db" \
  --artifacts-destination "${ARTIFACT_ROOT}" \
  --default-artifact-root mlflow-artifacts:/ \
  --serve-artifacts \
  --enable-workspaces \
  --static-prefix "${MLFLOW_STATIC_PREFIX}" \
  --x-frame-options SAMEORIGIN \
  --host 127.0.0.1 \
  --port "${MLFLOW_PORT}" &
MLFLOW_PID=$!

echo "Starting Tensorlane gateway on 127.0.0.1:${API_PORT}"
"$TL_BIN" serve --host 127.0.0.1 --port "${API_PORT}" &
API_PID=$!

cleanup() {
  kill "$API_PID" "$MLFLOW_PID" 2>/dev/null || true
}
trap cleanup EXIT

wait_http "http://127.0.0.1:${MLFLOW_PORT}${MLFLOW_STATIC_PREFIX}/health" "MLflow"
wait_http "http://127.0.0.1:${API_PORT}/health" "Tensorlane gateway"

echo "Provisioning MLflow workspaces for Tensorlane rows"
"$TL_BIN" sync-workspaces

echo
echo "Gateway:   http://localhost:${API_PORT}"
echo "Dashboard: http://localhost:${WEB_PORT}"
echo "Tracking:  MLFLOW_TRACKING_TOKEN=tl_live_... mlflow.set_tracking_uri(\"http://localhost:${API_PORT}\")"
echo "Smoke:     $TL_PY tensorlane/scripts/smoke_tracking.py --gateway http://127.0.0.1:${API_PORT} --web http://127.0.0.1:${WEB_PORT}"
echo

(
  cd "$ROOT/tensorlane/web"
  if [[ ! -d node_modules ]]; then
    npm install --min-release-age=7
  fi
  npm run dev -- --port "${WEB_PORT}"
)
