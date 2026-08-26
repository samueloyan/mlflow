#!/usr/bin/env bash
# Single-container production process: private MLflow + worker + public gateway.
# MLflow binds 127.0.0.1 only. Tensorlane serve binds 0.0.0.0:$PORT.
set -euo pipefail

PORT="${PORT:-8080}"
MLFLOW_PORT="${MLFLOW_PORT:-5000}"
DATA_DIR="${TENSORLANE_DATA_DIR:-/var/mlflow}"
if ! mkdir -p "${DATA_DIR}/artifacts" 2>/dev/null; then
  DATA_DIR="/tmp/mlflow"
  mkdir -p "${DATA_DIR}/artifacts"
fi

export MLFLOW_INTERNAL_URI="${MLFLOW_INTERNAL_URI:-http://127.0.0.1:${MLFLOW_PORT}}"
export MLFLOW_STATIC_PREFIX="${MLFLOW_STATIC_PREFIX:-/mlflow}"
export ARTIFACT_ROOT="${ARTIFACT_ROOT:-file://${DATA_DIR}/artifacts}"
export WEB_INTERNAL_URI="${WEB_INTERNAL_URI:-}"

normalize_mlflow_uri() {
  local uri="$1"
  case "$uri" in
    postgresql+*|sqlite*|mysql*|mssql*) printf '%s\n' "$uri" ;;
    postgres://*) printf 'postgresql+psycopg2://%s\n' "${uri#postgres://}" ;;
    postgresql://*) printf 'postgresql+psycopg2://%s\n' "${uri#postgresql://}" ;;
    *) printf '%s\n' "$uri" ;;
  esac
}

if [[ -z "${MLFLOW_BACKEND_STORE_URI:-}" ]]; then
  MLFLOW_BACKEND_STORE_URI="sqlite:////${DATA_DIR}/mlflow.db"
fi
MLFLOW_BACKEND_STORE_URI="$(normalize_mlflow_uri "$MLFLOW_BACKEND_STORE_URI")"
export MLFLOW_BACKEND_STORE_URI

wait_http() {
  local url="$1"
  python - "$url" <<'PY'
import sys
import time
import urllib.error
import urllib.request

url = sys.argv[1]
for _ in range(90):
    try:
        urllib.request.urlopen(url, timeout=2)
        sys.exit(0)
    except (urllib.error.URLError, TimeoutError, OSError):
        time.sleep(2)
sys.exit(1)
PY
}

# A monorepo checkout has ./mlflow at the root. Starting from that cwd makes
# `import mlflow` load the source tree (no tracking UI) instead of the PyPI
# wheel baked into the image. Always run subprocesses from DATA_DIR.
cd "${DATA_DIR}"

echo "Starting MLflow on 127.0.0.1:${MLFLOW_PORT}"
MLFLOW_ARGS=(
  --backend-store-uri "${MLFLOW_BACKEND_STORE_URI}"
  --serve-artifacts
  --enable-workspaces
  --static-prefix "${MLFLOW_STATIC_PREFIX}"
  --x-frame-options SAMEORIGIN
  --host 127.0.0.1
  --port "${MLFLOW_PORT}"
  --workers 1
)
# Clients must receive mlflow-artifacts:/ so uploads go through the tracking
# server. A file:// or s3:// default-artifact-root makes the SDK write locally
# (or require cloud credentials) instead of PUTing /api/2.0/mlflow-artifacts.
MLFLOW_ARGS+=(
  --artifacts-destination "${ARTIFACT_ROOT}"
  --default-artifact-root mlflow-artifacts:/
)
mlflow server "${MLFLOW_ARGS[@]}" &

echo "Starting Tensorlane worker"
tensorlane worker --interval 5 &

(
  if wait_http "http://127.0.0.1:${MLFLOW_PORT}${MLFLOW_STATIC_PREFIX}/health"; then
    echo "MLflow is up; syncing workspaces"
    tensorlane sync-workspaces || true
  else
    echo "MLflow did not become ready; gateway will retry workspace sync on boot" >&2
  fi
) &

echo "Starting Tensorlane gateway on 0.0.0.0:${PORT}"
exec tensorlane serve --host 0.0.0.0 --port "${PORT}"
