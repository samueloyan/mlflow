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

## Decisions

| Topic | Choice |
| --- | --- |
| Identity | Better Auth (email/password + Google/GitHub/Microsoft). Tensorlane owns orgs. |
| Frontend | Next.js app with Tensorlane chrome. MLflow UI at `/tracking` (iframe of `/mlflow/`). |
| Isolation | Default: org members access every workspace. Organizations may switch to restricted grants. |
| Limits | Warn at 80%. Traces/runs soft. API requests throttled. Storage and seats hard. |
| Billing | Stripe when configured; sandbox checkout otherwise. Webhooks are the source of truth. |
| Jobs | Postgres `jobs` table. `tensorlane worker` claims rows. Redis is optional for rate limits. |
| License | `tensorlane/` proprietary. `mlflow/` Apache 2.0. |

## Local development (no Docker)

`scripts/dev.sh` starts the gateway and Next.js with the data plane stubbed (`MLFLOW_INTERNAL_URI=null://`). Use that for control-plane and chrome work. Tracking pages fail closed until a real MLflow server is running.

### UI-only (stubbed tracking)

```bash
uv venv .venv-tensorlane
source .venv-tensorlane/bin/activate
uv pip install -e "./tensorlane[dev]"
export DATABASE_URL=sqlite:////$PWD/tensorlane-dev.db
export TENSORLANE_PEPPER=dev-pepper-change-me
export TENSORLANE_SECRET_KEY=dev-secret-change-me
chmod +x tensorlane/scripts/dev.sh tensorlane/scripts/dev-full.sh
./tensorlane/scripts/dev.sh
```

- Gateway: `http://localhost:8080`
- Dashboard (hot reload): `http://localhost:3000`

### Full local path (real tracking, still not production)

Needs this checkout's MLflow CLI (repo `.venv` after `uv sync`) plus `.venv-tensorlane`. Starts MLflow with `--enable-workspaces --static-prefix /mlflow`, points the gateway at it, and syncs Tensorlane workspaces into the data plane.

```bash
./tensorlane/scripts/dev-full.sh
```

In another terminal, log a run (creates a workspace-scoped `tl_live_` key if you pass dashboard credentials):

```bash
.venv-tensorlane/bin/python tensorlane/scripts/smoke_tracking.py \
  --gateway http://127.0.0.1:8080 \
  --web http://127.0.0.1:3000 \
  --email you@example.com --password 'your-password'
```

Or the SDK contract against the same gateway:

```python
import os
import mlflow

os.environ["MLFLOW_TRACKING_TOKEN"] = "tl_live_..."
mlflow.set_tracking_uri("http://localhost:8080")
mlflow.set_experiment("fraud-detection")
```

If workspaces were created while MLflow was stubbed, provision them on the live server:

```bash
export MLFLOW_INTERNAL_URI=http://127.0.0.1:5000
tensorlane sync-workspaces
```

Native Overview / Experiments / Runs talk ajax-api through the gateway. The `/tracking` iframe needs MLflow's built UI assets (the Compose image includes them). A source `mlflow server` from this checkout serves a landing-page message until `mlflow/server/js` is built.

```bash
./tensorlane/scripts/test.sh
# or:
python -m pytest tests/tensorlane --confcutdir=tests/tensorlane
```

Demo isolation tenants (API sessions only; set a password via signup to use the UI):

```bash
tensorlane seed
tensorlane worker --interval 2
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
- Invite tokens and SCIM secrets are HMAC-hashed. Raw values are shown once.
- Stripe webhooks verify `t=` / `v1=` signatures. Event ids are idempotent.

## Phases 2–5

The dashboard covers billing, audit, cost, SSO/SCIM, retention, approvals, monitoring, and AI surfaces (experiments, traces, prompts, evaluations) with saved views. `GET /api/v1/plans` is public. `POST /api/v1/billing/webhook` is unauthenticated and signature-gated. SCIM 2.0 Users live at `/scim/v2`.
