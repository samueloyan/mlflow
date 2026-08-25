# Tensorlane

Tensorlane is an AI engineering platform for tracking, evaluating, managing, and operating models and AI applications. It is **MLflow compatible**.

This directory is proprietary Tensorlane software. Upstream MLflow remains under Apache 2.0 in `mlflow/`.

Product name: **Tensorlane**. Never “Tensorlane MLflow.” Compatibility: **MLflow compatible.**

Public host: `https://api.tensorlane.ai` (dashboard, `/api/v1`, and the MLflow protocol on one origin).

```python
import mlflow
import os

os.environ["MLFLOW_TRACKING_TOKEN"] = "tl_live_..."
mlflow.set_tracking_uri("https://api.tensorlane.ai")
mlflow.set_experiment("fraud-detection")
```

## Decisions (Phase 1)

| Topic | Choice |
| --- | --- |
| Identity | Better Auth (email/password + Google/GitHub/Microsoft). Tensorlane owns orgs. |
| Frontend | Next.js app with Tensorlane chrome. MLflow UI at `/tracking` (iframe of `/mlflow/`). |
| Isolation | Org members access every workspace. Roles still apply. |
| Limits | Warn at 80%. Traces/runs soft. API requests throttled. Storage and seats hard. |
| License | `tensorlane/` proprietary. `mlflow/` Apache 2.0. |

## Local development (no Docker)

```bash
uv venv .venv-tensorlane
source .venv-tensorlane/bin/activate
uv pip install -e "./tensorlane[dev]"
export DATABASE_URL=sqlite:////$PWD/tensorlane-dev.db
export TENSORLANE_PEPPER=dev-pepper-change-me
export TENSORLANE_SECRET_KEY=dev-secret-change-me
chmod +x tensorlane/scripts/dev.sh
./tensorlane/scripts/dev.sh
```

- Gateway: `http://localhost:8080`
- Dashboard (hot reload): `http://localhost:3000`

```bash
./tensorlane/scripts/test.sh
# or:
python -m pytest tests/tensorlane --confcutdir=tests/tensorlane
```

Demo isolation tenants (API sessions only; set a password via signup to use the UI):

```bash
tensorlane seed
```

## Docker Compose

```bash
cp deploy/compose/.env.example deploy/compose/.env
docker compose -f deploy/compose/docker-compose.yml up --build
```

Open `http://localhost:8080`. The gateway is the only published process. MLflow binds inside the network with `--enable-workspaces --static-prefix /mlflow --x-frame-options SAMEORIGIN`.

```bash
docker compose -f deploy/compose/docker-compose.yml exec gateway tensorlane seed
```

## Layout

| Path | Role |
| --- | --- |
| `src/tensorlane/` | Control plane, entitlements, gateway |
| `web/` | Next.js dashboard + Better Auth |
| `../tests/tensorlane/` | Isolation, API, compatibility tests |
| `../deploy/compose/` | Full local stack |

## Security notes

- API key secrets are shown once. Only HMAC-SHA256 hashes are stored.
- The gateway overwrites `X-MLFLOW-WORKSPACE` after authorization. Clients cannot select another tenant’s workspace.
- Authorization and cookies are stripped before traffic reaches MLflow.
- Tensorlane errors are `{ "error": { "code", "message", "request_id" } }`. MLflow SDK routes keep MLflow JSON.
