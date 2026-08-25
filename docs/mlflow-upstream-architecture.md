# MLflow Upstream Architecture

This document maps the MLflow tree that Tensorlane is built on. It is an analysis of **this repository**, not a redesign.

**Inspection date:** 2026-08-25  
**Repository:** `https://github.com/samueloyan/mlflow` (clone of upstream MLflow)  
**HEAD:** `627d1ebd02d310a5e665fed6045559a2e0caead5` (2026-08-21)  
**Declared version:** `3.15.2.dev0` (`mlflow/version.py`, `pyproject.toml`)  
**Latest stable upstream release:** **MLflow 3.15.1** (2026-08-03, tag `v3.15.1`)  
**License:** Apache License 2.0, copyright Databricks, Inc. (`LICENSE.txt`)

This working tree is **newer than the latest stable tag**. It includes post-3.15.1 commits on `master`. Tensorlane should pin a **named upstream revision** for every release (see [upstream-sync.md](./upstream-sync.md)).

There is **no Tensorlane code** in this repository yet. Origin has a single remote (`origin` → `samueloyan/mlflow`). Official MLflow is not configured as `upstream`.

---

## 1. What MLflow is today

MLflow 3.x is an **AI engineering platform**, not only classic experiment tracking. The same process serves:

| Domain | What it does |
| --- | --- |
| Experiment tracking | Experiments, runs, params, metrics, tags, artifacts |
| Model registry | Registered models, versions, aliases, tags |
| Prompt registry | Prompts stored as tagged registered models (`prompts:/name/version`) |
| Tracing | OpenTelemetry-compatible traces, spans, assessments |
| Evaluation | GenAI `evaluate()`, scorers, judges, datasets, review queues |
| AI Gateway | Model endpoints, secrets, budgets, guardrails |
| MCP registry | Model Context Protocol server catalog |
| Workspaces | Optional multi-workspace isolation (experimental since 3.10) |
| Auth / RBAC | Optional Basic Auth plugin with roles |
| Webhooks | Registry/prompt event delivery |
| Jobs | Huey-backed background jobs (scorers, eval, prompt optimization) |
| UI | React 18 + TypeScript tracking/registry/gateway admin UI |

Python 3.10+ is required. Packages: `mlflow` (full), `mlflow-skinny`, `mlflow-tracing`.

---

## 2. Process and request path

```text
mlflow server
    │
    ├── default: uvicorn → mlflow.server.fastapi_app:app
    │         FastAPI routers (artifacts stream, gateway invoke, OTLP, jobs, assistant, MCP)
    │         └── Flask mounted via WSGI for tracking/registry REST + UI
    ├── --gunicorn-opts → Flask only (deprecated vs uvicorn)
    └── --waitress-opts → Flask (Windows)
```

**Key files**

| File | Role |
| --- | --- |
| `mlflow/cli/__init__.py` | `mlflow server` / `mlflow ui` |
| `mlflow/server/__init__.py` | Flask `app`, route registration, `_run_server` |
| `mlflow/server/fastapi_app.py` | FastAPI wrapper, security + workspace middleware |
| `mlflow/server/handlers.py` | Protobuf-generated REST handlers, store init, `HANDLERS` |
| `mlflow/server/workspace_helpers.py` | `X-MLFLOW-WORKSPACE` resolution |
| `mlflow/server/security.py` / `fastapi_security.py` | Host, CORS, X-Frame |
| `mlflow/server/auth/__init__.py` | `create_app` Basic Auth plugin |

Default workers: 4. Parent process sets `_MLFLOW_SERVER_*` env vars so workers share backend/artifact config.

**Handler registration:** protobuf services (`MlflowService`, `ModelRegistryService`, …) → `get_endpoints()` → `/api/{N}.0/mlflow/...` and `/ajax-api/{N}.0/mlflow/...`.

**SDK path:** `MlflowClient` → `TrackingServiceClient` / registry client → `RestStore` → HTTP. Token auth uses `MLFLOW_TRACKING_TOKEN` (Bearer). Workspace is sent as `X-MLFLOW-WORKSPACE` when set (`mlflow/utils/rest_utils.py`).

---

## 3. REST API surface

Versioning is `/api/{major}.0/...` (SDK) and `/ajax-api/{major}.0/...` (UI). Major is mostly **2**, newer features **3**, some UI metrics **4**.

| Group | Prefix / location |
| --- | --- |
| Experiments, runs, metrics, params, tags | `/api/2.0/mlflow/experiments/*`, `/runs/*`, `/metrics/*` |
| Artifacts | `/api/2.0/mlflow/artifacts/*`, `/api/2.0/mlflow-artifacts/*`, FastAPI artifact router |
| Registered models / versions / aliases | `/api/2.0/mlflow/registered-models/*`, `/model-versions/*` |
| Traces | `/api/2.0` and `/api/3.0/mlflow/traces*`, `/mlflow/tracing/*` |
| OTLP | `/v1/traces` (`mlflow/server/otel_api.py`) |
| Datasets / evaluations / scorers | `/mlflow/datasets/*`, genai evaluate ajax, scorers, review-queues |
| Prompts | Registry models with prompt tags; UC-only prompt APIs exist but are Databricks-oriented |
| Workspaces | `/api/3.0/mlflow/workspaces/*` (gated by `--enable-workspaces`) |
| Auth / RBAC | `/mlflow/users/*`, `/mlflow/roles/*` via auth plugin |
| Gateway | CRUD `/mlflow/gateway/*`; invoke `/gateway/...` |
| Jobs | `/ajax-api/3.0/jobs` |
| GraphQL | `/graphql` |
| Health | `/health`, `/version`, `/ajax-api/3.0/mlflow/server-info` |

Do **not** put Tensorlane-native APIs on `/api/2.0/mlflow/...`. Keep `/api/v1/...` for Tensorlane control-plane APIs.

---

## 4. Store abstraction (tracking)

```text
AbstractStore
    ├── SqlAlchemyStore              # PostgreSQL / MySQL / MSSQL / SQLite
    ├── WorkspaceAwareSqlAlchemyStore # used when MLFLOW_ENABLE_WORKSPACES=true
    ├── FileStore
    ├── RestStore                    # client
    └── DatabricksTracingRestStore
```

Registry: `TrackingStoreRegistry` + entry point group `mlflow.tracking_store`.

**Initialization:** `initialize_backend_stores()` in `handlers.py`. URI scheme selects the store (`postgresql://...` → SQLAlchemy). With workspaces enabled, SQL backends construct `WorkspaceAwareSqlAlchemyStore`.

File store is **not** a production multi-tenant backend. Tensorlane Cloud should always use PostgreSQL.

---

## 5. Database

### 5.1 Tracking / registry (Alembic: `mlflow/store/db_migrations/`)

No Postgres schema namespace. Tables live in the database default schema.

**Tracking** (`mlflow/store/tracking/dbmodels/models.py`) includes:

- `experiments` — PK `experiment_id` (**global integer**, not per-workspace). Unique `(workspace, name)`.
- `runs`, `metrics`, `latest_metrics`, `params`, `tags`, `experiment_tags`
- `datasets` / `inputs` (run inputs)
- `logged_models*`
- `trace_info`, `trace_tags`, `trace_request_metadata`, `trace_metrics`, `spans`, `span_metrics`, assessments
- `evaluation_datasets*` (own `workspace` column)
- `scorers*` (scoped via experiment join)
- Gateway: `secrets`, `endpoints`, `model_definitions`, `budget_policies`, `guardrails` (own `workspace` columns)
- `jobs`
- `label_schemas`, `review_queues*` (scoped via experiment)
- `mcp_servers*` (composite PK `(workspace, name)`)
- `issues`

**Registry** (`mlflow/store/model_registry/dbmodels/models.py`):

- `registered_models` — PK **`(workspace, name)`**
- `model_versions`, tags, `registered_model_aliases`
- `webhooks`, `webhook_events`

**Workspaces** (`mlflow/store/workspace/dbmodels/models.py`):

- `workspaces` — PK `name` (max 63 chars)
- Columns: `description`, `default_artifact_root`, `trace_archival_location`, `trace_archival_retention`
- **No SQL foreign keys** from resource tables to `workspaces` (external providers such as Kubernetes namespaces are first-class)

### 5.2 Auth DB (separate URI)

Alembic: `mlflow/server/auth/db/migrations/`

| Table | Purpose |
| --- | --- |
| `users` | username, `password_hash` (Werkzeug PBKDF2), `is_admin` |
| `roles` | unique `(workspace, name)` |
| `role_permissions` | resource_type, resource_pattern, permission |
| `user_role_assignments` | user ↔ role |

Legacy permission tables remain for rollback; runtime uses RBAC.

Default auth DB is **SQLite** (`sqlite:///basic_auth.db`) via `mlflow/server/auth/basic_auth.ini`.

### 5.3 Isolation mechanism

When workspaces are enabled, `WorkspaceAwareSqlAlchemyStore._get_query()` adds SQL filters:

- Experiments, evaluation datasets, gateway objects: `workspace = :active`
- Runs, traces, scorers, issues, label schemas, review queues: **join through `experiments.workspace`**
- Logged models: subquery of experiment IDs in the active workspace

This is **application-level query filtering**, not Postgres RLS, not schema-per-tenant, not a separate database per tenant.

If workspaces are **disabled**, tracking queries are unfiltered. The store refuses to start if non-default workspace rows exist.

---

## 6. Workspaces (native)

**Feature flag:** `--enable-workspaces` / `MLFLOW_ENABLE_WORKSPACES` (experimental since 3.10).

| Constant | Value |
| --- | --- |
| Default workspace | `"default"` (reserved, cannot be deleted) |
| Header | `X-MLFLOW-WORKSPACE` |
| Client env | `MLFLOW_WORKSPACE` |
| Name rules | Kubernetes-style `^[a-z0-9]([-a-z0-9]*[a-z0-9])?$`, length 2–63 |
| Reserved names | `default`, `workspaces`, `api`, `ajax-api`, `static-files` |

**Request flow**

1. Client sends `X-MLFLOW-WORKSPACE` (SDK does this automatically from `mlflow.set_workspace()` / env).
2. Flask `workspace_before_request_handler` / FastAPI workspace middleware calls `resolve_workspace_from_header()`.
3. Active workspace is stored in a **ContextVar** (`mlflow/utils/workspace_context.py`). The server does **not** set process env.
4. Stores call `WorkspaceAwareMixin._get_active_workspace()`. If workspaces are enabled and no context is set, the store **errors**.

**Fluent API:** `mlflow.set_workspace`, `create_workspace`, `list_workspaces`, … in `mlflow/tracking/_workspace/fluent.py`.

**Artifact roots per workspace:** `workspaces.default_artifact_root`. If unset, server default is used and MLflow appends `/workspaces/<name>/`. If set, that URI is used **without** appending the prefix (`resolve_artifact_root` → `should_append=False`).

**Plugin:** entry point `mlflow.workspace_provider` (`mlflow/tracking/_workspace/registry.py`).

**What workspaces are not:** they are not organizations, billing accounts, identity providers, or a substitute for authentication. Anyone who can reach the server can send any existing workspace name in the header unless auth is enabled.

**UI:** `mlflow/server/js/src/workspaces/` — selector, `?workspace=` query param, landing page gated by `useWorkspacesEnabled`.

---

## 7. Authentication and authorization

Enabled with `mlflow server --app-name basic-auth` (`mlflow.app` entry point `basic-auth = mlflow.server.auth:create_app`).

**Authentication**

- Default: HTTP Basic → `authenticate_request_basic_auth()`
- Pluggable: `authorization_function = module:func` in `basic_auth.ini` / `MLFLOW_AUTH_CONFIG_PATH`
- Passwords hashed with Werkzeug (PBKDF2). Optional per-worker auth cache (off by default).
- Super-admin: `users.is_admin` bypasses permission validators
- Unprotected: `/static`, `/favicon.ico`, `/health`

**Permissions** (`mlflow/server/auth/permissions.py`): `NO_PERMISSIONS` < `READ` < `USE` < `EDIT` < `MANAGE`.

Workspace-scope grants on `resource_type=workspace` pattern `*`: only `USE` or `MANAGE`. Workspace `MANAGE` folds into resource checks (workspace admin). Workspace `USE` does not.

**Important:** Auth gates HTTP routes and often **post-filters list responses**. It does not add SQL RLS. Workspaces filter SQL; auth filters who may call which route / see which rows in a list.

**Fail-closed** is opt-in (`MLFLOW_BASIC_AUTH_FAIL_CLOSED`). Some routes may remain ungated unless that is enabled.

**Not present:** SSO, SAML, OIDC, SCIM, API keys, PATs, hashed bearer tokens, invites, org tenancy. Third-party plugins (for example `mlflow-oidc-auth`) exist outside this tree.

---

## 8. Artifact architecture

**Abstraction:** `ArtifactRepository` in `mlflow/store/artifact/artifact_repo.py`  
**Registry:** `mlflow.artifact_repository` entry points

| Scheme | Implementation |
| --- | --- |
| `s3` | `S3ArtifactRepository` (MPU, MPD, presigned upload/download) |
| `gs` | GCS (MPU) |
| `wasbs` / `abfss` | Azure Blob / Data Lake |
| `r2` / `b2` | Cloudflare R2 / Backblaze |
| `mlflow-artifacts` | Proxied through tracking server (`--serve-artifacts`) |
| `http(s)` | HTTP repo |
| `file` | Local |

**Run URI layout (workspaces enabled, server default root):**

```text
{default_artifact_root}/workspaces/{workspace_name}/{experiment_id}/{run_id}/artifacts
```

**If the workspace has `default_artifact_root`:**

```text
{workspace.default_artifact_root}/{experiment_id}/{run_id}/artifacts
```

Path validation: `validate_path_is_safe`, `validate_path_within_directory`, `verify_artifact_path`. Handlers validate all artifact, MPU, and presigned routes.

`--serve-artifacts` makes the server proxy uploads/downloads (`mlflow-artifacts:/`). For Tensorlane, prefer **presigned URLs to tenant-prefixed object keys** so the tracking server is not a bandwidth bottleneck. MLflow 3.15 already has proxy-less / presigned transfer paths; reuse them.

Clients must not be allowed to set `artifact_location` when workspaces are enabled (`create_experiment` rejects it).

---

## 9. Model registry, prompts, tracing, evaluation

### Model registry

Full CRUD via `MlflowClient`. Aliases (`@champion`, `@production`) are first-class. Prompts **are** registered models with tags such as `mlflow.prompt.is_prompt` (`mlflow/prompt/constants.py`). URI: `prompts:/name/version` or `prompts:/name@alias`.

### Tracing

Store methods on tracking `AbstractStore`: `start_trace`, `get_trace`, `search_traces`, `log_spans`, assessments. Spans stored as JSON in `spans.content`. OTLP ingestion at `/v1/traces`. Python SDK: `mlflow.tracing`. Archival location/retention can be per workspace.

### Evaluation

- Classic: `mlflow.evaluate` + `mlflow.model_evaluator` plugins
- GenAI: `mlflow.genai.evaluation.base.evaluate()`, scorers (`mlflow.scorer_store`), judges, datasets, review queues, online scoring jobs

### Webhooks

Registry/prompt events, signed delivery, SSRF protections in `mlflow/webhooks/`. Not a general-purpose customer webhook product (no org-level billing/security events).

### Jobs

Huey consumers, file-backed store by default (`mlflow/server/jobs/`). Allowed job names are allowlisted. Workspace-aware job store exists. This is **not** a general SaaS job platform (no Redis requirement, no multi-tenant billing jobs).

---

## 10. Frontend

Path: `mlflow/server/js/`

- React 18, TypeScript, Redux, Apollo GraphQL, TanStack Query, Emotion
- Design system: `@databricks/design-system` (vendored)
- Hash router: `MlflowRouter.tsx`
- Domains: `experiment-tracking/`, `model-registry/`, `gateway/`, `admin/`, `account/`, `home/`, `assistant/`, `mcp-registry/`, `workspaces/`, `settings/`
- OSS vs Databricks feature flags: `src/common/utils/FeatureUtils.ts` (Copybara stripping)
- UI calls `/ajax-api`, `/graphql`, `/get-artifact`, `/gateway`
- Sends `X-MLFLOW-WORKSPACE` (`FetchUtils.ts`)

Sidebar today: Home, Experiments, Models, Prompts, Gateway, MCP, Settings, plus workspace selector when enabled. There is **no** Organizations, Billing, Usage, Audit Logs, or Tensorlane navigation.

Dev: `uv run dev/run_dev_server.py` from repo root (backend + JS hot reload).

---

## 11. Plugin / extension points (reuse these)

| Entry point group | Use |
| --- | --- |
| `mlflow.app` | Wrap Flask/FastAPI (`--app-name`). Auth is the built-in example. |
| `mlflow.app.client` | Client companion for an app plugin |
| `mlflow.tracking_store` | Custom tracking backend URI scheme |
| `mlflow.model_registry_store` | Custom registry backend |
| `mlflow.artifact_repository` | Custom object-store scheme |
| `mlflow.workspace_provider` | Custom workspace catalog |
| `mlflow.request_header_provider` | Extra client headers |
| `mlflow.request_auth_provider` | Client request auth |
| `mlflow.scorer_store` | Scorer persistence |
| `mlflow.model_evaluator` | Classic evaluators |
| `mlflow.deployments` | Deployment targets |
| `mlflow.gateway.providers` | Gateway LLM providers |
| `authorization_function` | Replace Basic Auth without forking `create_app` |

Loader: `mlflow/utils/plugins.py` (`importlib.metadata` entry points).

---

## 12. Local and production packaging already in-tree

| Asset | Path |
| --- | --- |
| Docker Compose (Postgres + S3-compatible RustFS + MLflow) | `docker-compose/` |
| Docker images | `docker/Dockerfile*` |
| Helm chart | `charts/` |
| Security defaults | localhost-only hosts/CORS unless configured |

Compose today does **not** enable workspaces, auth, Redis, or a control plane.

---

## 13. Tests Tensorlane can build on

Upstream already tests workspace SQL isolation and auth cross-workspace denial:

- `tests/store/tracking/sqlalchemy_store/test_sqlalchemy_workspace_store.py` — including `test_run_lifecycle_operations_workspace_isolation`, `test_artifact_operations_enforce_workspace_isolation`
- `tests/server/auth/test_auth_workspace.py` — `test_cross_workspace_access_denied` and many siblings
- `tests/server/auth/test_client_workspace.py`

These are **workspace** isolation tests, not **organization** isolation tests. Tensorlane must add org-vs-org cases (see [security-model.md](./security-model.md)).

---

## 14. What MLflow already gives Tensorlane (do not rewrite)

- Tracking and registry REST + Python SDK compatibility
- PostgreSQL metadata store + Alembic
- S3-compatible artifacts, presigned URLs, multipart upload
- Native workspaces with SQL filters and per-workspace artifact roots
- Optional RBAC plugin with pluggable `authorization_function`
- Tracing (including OTLP), prompts-as-registry, evaluations/scorers
- React UI for experiments, runs, models, traces, prompts, gateway
- Server security middleware (hosts, CORS, clickjacking)
- Helm/Docker Compose starting points
- Plugin registries sufficient to attach a control plane **around** MLflow

## 15. What MLflow does not give Tensorlane

- Organizations, membership, invitations
- Public ULID ids (`org_`, `ws_`, `usr_`, `tl_live_`)
- Email/password + social login + enterprise SSO/SCIM as a product
- Hashed API keys and service accounts
- Billing, Stripe, entitlements, usage metering
- Org-level audit log product
- Rate limiting as a multi-tenant SaaS policy
- Dedicated-tenant deployment product
- Tensorlane branding and control-plane UI
- Redis-backed jobs/rate-limits (Huey file store is local)
- Guarantee that a hostile client cannot pick another workspace without auth

---

## 16. Implications for a maintainable distribution

1. Treat `mlflow/` as **upstream**. Prefer plugins and a sidecar control plane.
2. Enable `--enable-workspaces` in Tensorlane Cloud. Do not invent a second workspace table inside MLflow.
3. Do not add org_id columns to MLflow tables. Map Tensorlane orgs/workspaces in the control plane.
4. Do not replace `MlflowClient` / `import mlflow`.
5. Do not casually migrate or rename upstream tables.
6. Pin and sync against upstream tags; this tree is already `3.15.2.dev0` on `master`.
