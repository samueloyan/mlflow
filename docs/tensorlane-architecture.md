# Tensorlane Architecture

**Status:** Proposed (Phase 0). Implementation starts only after approval.

Tensorlane is a **managed AI engineering platform** that is **MLflow compatible**. It is not a reskin and not a rewrite of MLflow.

This document describes the target architecture and how it attaches to the upstream tree documented in [mlflow-upstream-architecture.md](./mlflow-upstream-architecture.md).

---

## 1. Positioning

Customers keep:

```python
import mlflow
mlflow.set_tracking_uri("https://api.tensorlane.ai")
mlflow.set_experiment("fraud-detection")
```

with `MLFLOW_TRACKING_TOKEN=tl_live_...`.

They choose Tensorlane over self-hosted MLflow because of organizations, identity, isolation, storage, billing, governance, and (later) evaluation/observability product depth — not because we renamed buttons.

Product name: **Tensorlane**. Compatibility: **MLflow compatible**. Never “Tensorlane MLflow.”

---

## 2. Layering

```text
                    TENSORLANE
                         │
               ┌─────────┴─────────┐
               │                   │
         Control Plane        Data Plane
               │                   │
    Orgs, users, keys,      MLflow-compatible
    billing, entitlements,  engine (unmodified
    audit, SSO config       mlflow/ + plugins)
               │                   │
               └─────────┬─────────┘
                         │
                  Tensorlane Gateway
                         │
              ┌──────────┼──────────┐
              │          │          │
         PostgreSQL   Object     Redis
         (two DBs)    storage    (limits/jobs)
```

**Control plane** — Tensorlane APIs `/api/v1/*`, dashboard BFF.  
**Data plane** — `mlflow server --enable-workspaces` plus a Tensorlane `mlflow.app` plugin.  
**Gateway** — public edge: TLS, authn, authz, tenant bind, rate limits, request IDs, proxy.

Processes are separate so we can scale trace ingest independently of billing APIs. Locally, Docker Compose starts all of them.

---

## 3. Proposed repository layout

Keep this git repository as the **distribution fork** of MLflow. Proprietary code never lands inside `mlflow/server/handlers.py` or SQLAlchemy models.

```text
.
├── mlflow/                    # UPSTREAM — do not modify without an ADR
├── tests/                     # UPSTREAM tests (keep running)
├── tensorlane/                # PROPRIETARY (new)
│   ├── pyproject.toml         # package tensorlane; entry points for mlflow.app
│   ├── control_plane/         # FastAPI: orgs, members, workspaces, keys, usage
│   ├── gateway/               # Auth, tenant bind, rate limit, reverse proxy
│   ├── data_plane/            # mlflow.app plugin, internal auth, metering hooks
│   ├── entitlements/          # EntitlementService, plan documents
│   ├── billing/               # Stripe (Phase 2)
│   ├── jobs/                  # Redis-backed workers (emails, usage rollup, purge)
│   ├── identity/              # IdentityProvider adapter
│   ├── storage/               # ArtifactStorageProvider (S3)
│   ├── observability/         # OTel setup
│   ├── sdk/                   # tensorlane Python SDK (orgs/usage/keys only)
│   ├── cli/                   # tensorlane login | org list | ...
│   └── web/                   # Tensorlane dashboard (orgs, billing, chrome)
├── tests/tensorlane/          # Isolation, compatibility, billing, e2e
├── deploy/
│   ├── compose/               # Local: gateway, control plane, mlflow, postgres, redis, s3, worker
│   └── k8s/                   # Later; do not require k8s for local
├── docs/                      # This architecture set + ADRs
├── NOTICE                     # MLflow/Databricks attribution (to add)
└── LICENSE.txt                # Keep Apache 2.0 for upstream files
```

Python packages:

- `mlflow` — as today.
- `tensorlane` — depends on `mlflow`, registers `tensorlane = tensorlane.data_plane.app:create_app` under `mlflow.app`.

Frontend:

- **Tensorlane web** — organizations, members, API keys, usage, settings, overview dashboard.
- **MLflow UI** — experiments, runs, traces, models, prompts, evaluations, served behind the gateway with Tensorlane session and workspace binding. Do not clone every MLflow view.

---

## 4. Runtime (local and cloud)

### Local (`docker compose up`)

| Service | Role |
| --- | --- |
| `postgres` | Databases `mlflow` and `tensorlane` |
| `redis` | Rate limits, job queue |
| `minio` or existing RustFS | S3-compatible artifacts |
| `mlflow` | Data plane (`--enable-workspaces --app-name tensorlane`) |
| `control-plane` | `/api/v1` |
| `gateway` | `:443` or `:8080` public entry |
| `worker` | Control-plane jobs |

Seed: two orgs (Acme, Othercorp), users, workspaces, API keys — used by isolation tests.

Upstream `docker-compose/` remains as MLflow’s own stack; Tensorlane compose lives under `deploy/compose/` so we do not fight upstream compose changes.

### Production (shared SaaS)

```text
Internet → CDN/WAF → LB → Gateway
                            ├── Control plane (n replicas)
                            ├── MLflow data plane (n replicas, uvicorn)
                            └── Workers
                     PostgreSQL (PITR) + Redis + Object storage
```

Kubernetes is the target, not a local requirement. Helm can wrap later; start with Compose + container images.

Dedicated enterprise: same images, dedicated Postgres, bucket, and encryption config (`TenantConfiguration`).

---

## 5. API layout

| Surface | Prefix | Audience |
| --- | --- | --- |
| MLflow compatible | `/api/2.0/mlflow/...`, `/api/3.0/mlflow/...`, `/ajax-api/...`, `/v1/traces` | SDK + MLflow UI |
| Tensorlane native | `/api/v1/...` | Dashboard + Tensorlane SDK/CLI |
| Health | `/health`, `/ready` | Probes |

Examples:

```text
POST   /api/v1/organizations
GET    /api/v1/organizations/{id}
POST   /api/v1/workspaces
POST   /api/v1/api-keys
DELETE /api/v1/api-keys/{id}
GET    /api/v1/usage
GET    /api/v1/audit-events
```

Error envelope (Tensorlane APIs only):

```json
{
  "error": {
    "code": "WORKSPACE_ACCESS_DENIED",
    "message": "You do not have permission to access this workspace.",
    "request_id": "req_01h..."
  }
}
```

MLflow endpoints keep MLflow’s JSON error shape so the SDK does not break.

---

## 6. Database architecture

**Same PostgreSQL cluster, two databases** (not two schemas inside one DB named `public` mixed with MLflow tables):

| Database | Owner | Contents |
| --- | --- | --- |
| `mlflow` | Data plane | Unmodified MLflow tracking, registry, workspace, jobs tables. Alembic: `mlflow db upgrade` |
| `tensorlane` | Control plane | Users, orgs, memberships, workspaces mapping, keys, plans, usage, audit, jobs, stripe refs. Alembic: Tensorlane migrations |

MLflow auth SQLite/SQL `users` table is **not** used for SaaS customers.

Indexes on the control plane follow real queries: `(org_id, created_at)`, API key hash unique, `(org_id, metric, period)` for usage.

Redis: ephemeral. Postgres remains source of truth.

---

## 7. MLflow compatibility strategy

1. Enable native workspaces on the data plane.
2. Put a gateway in front that speaks MLflow HTTP.
3. Authenticate with `MLFLOW_TRACKING_TOKEN`.
4. Bind `X-MLFLOW-WORKSPACE` server-side.
5. Use per-workspace artifact roots.
6. Run an **MLflow compatibility suite** (create experiment, run, params, metrics, artifacts, download, register model, search, start/get trace) against `https://gateway` on every CI run and after each upstream merge.

Do not fork `RestStore` or ship a replacement for `import mlflow`.

Tensorlane SDK (`from tensorlane import Tensorlane`) covers orgs, keys, usage, members only.

---

## 8. Request path (tracking write)

```text
SDK  --Bearer tl_live_-->  Gateway
  authenticate key (hashed)
  authorize(principal, runs.write, workspace, org)
  entitlement snapshot (cached)
  overwrite X-MLFLOW-WORKSPACE
  inject request_id
  enqueue usage event (async)
  proxy --> MLflow WorkspaceAwareSqlAlchemyStore
  artifacts --> signed PUT to s3 prefix
```

Hot-path budget: tenant bind + authz cache hit must stay small relative to existing MLflow handler time. No Stripe RPC on this path.

---

## 9. Frontend architecture

Phase 1 definition of done is **two orgs isolated**, not a complete nav of every future product surface.

**Ship**

- Tensorlane shell: sign-in, org switcher, workspace switcher, members, API keys, overview widgets that mean something (runs today, trace volume, storage, recent activity).
- MLflow UI for BUILD/AI surfaces, framed in Tensorlane chrome, workspace header injected, feature flags/entitlements hide Enterprise-only nav.

**Do not**

- Reimplement run comparison, trace waterfall, or metric charts from scratch in Phase 1.
- Leave MLflow’s logo as the product identity on customer-facing chrome.

Navigation (target, gated by entitlements):

```text
Overview
BUILD     Experiments  Runs  Models  Datasets
AI        Traces  Prompts  Evaluations
OPERATE   Deployments  Monitoring
MANAGE    Members  API Keys  Integrations  Usage  Audit Logs  Settings
```

Phase 1 can omit Deployments, Integrations, and full Audit UI if APIs + tests exist for isolation; Audit should at least be stored.

---

## 10. Jobs

| System | Use |
| --- | --- |
| MLflow Huey | Keep for native eval/scorer/prompt-optimize jobs inside the data plane |
| Tensorlane workers (Redis + ARQ or similar) | Emails, Stripe reconciliation, usage rollup, storage inventory, retention, webhook fanout (Phase 2+) |

Job records: `id`, `status`, `attempts`, timestamps, `error`, `organization_id`. Idempotent where possible.

---

## 11. Observability and rate limits

OpenTelemetry on gateway, control plane, and (where practical) data-plane plugin.

Rate limit dimensions: IP, user, API key, organization, endpoint class (`trace_ingest` vs `control_plane`). See [security-model.md](./security-model.md).

---

## 12. Open vs proprietary

| Layer | License intent |
| --- | --- |
| `mlflow/` | Apache 2.0, unchanged notices |
| Compatibility gateway patterns | May be open later; start proprietary |
| Control plane, billing, enterprise RBAC, admin | Proprietary |
| Tensorlane web chrome, entitlements | Proprietary |

Do not hide proprietary logic inside modified upstream files.

---

## 13. Phased delivery (reviewable slices)

See [phase-0-findings.md](./phase-0-findings.md) §M for the file-level plan. Summary:

| Phase | Outcome |
| --- | --- |
| 0 | This documentation (current) |
| 1 | Auth, orgs, workspaces, keys, Postgres, S3, MLflow tracking via gateway, basic dashboard, **org isolation tests** |
| 2 | Stripe, entitlements, metering, audit, self-serve golden path |
| 3 | Tracing/prompts/eval product depth on top of upstream features |
| 4 | SSO/SCIM, dedicated isolation, advanced RBAC, retention |
| 5 | Differentiation (quality monitoring, cost analytics, approvals) |

**Stop after Phase 0 until architecture is approved.**

---

## 14. Decisions already recorded

- [001 Tenant isolation](./adr/001-tenant-isolation.md)
- [002 Extension strategy](./adr/002-mlflow-extension-strategy.md)
- [003 Artifact storage](./adr/003-artifact-storage.md)
- [004 Authentication](./adr/004-authentication.md)
- [005 Billing and metering](./adr/005-billing-metering.md)
