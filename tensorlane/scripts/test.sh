#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
exec "$ROOT/.venv-tensorlane/bin/python" -m pytest tests/tensorlane --confcutdir="$ROOT/tests/tensorlane" "$@"
