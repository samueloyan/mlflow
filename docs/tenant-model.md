# Tensorlane Tenant Model

**Status:** Proposed (Phase 0). Do not implement until architecture approval.

This document defines how Tensorlane organizations and workspaces relate to MLflow’s native workspace feature, and how every request is bound to a tenant.

Related: [ADR 001](./adr/001-tenant-isolation.md), [security-model.md](./security-model.md).

---

## 1. Goals

- Every resource has explicit tenant ownership.
- Isolation is enforced **server-side** (gateway + SQL filters + object-key prefixes). UI filtering is never the control.
- Two independent organizations can share infrastructure without reading or mutating each other’s data.
- MLflow SDK semantics stay intact: `set_tracking_uri` + normal `log_*` / registry / tracing APIs.
- The model can later support dedicated databases/buckets per enterprise customer without rewriting the control plane.

---

## 2. Two layers

```text
Tensorlane control plane (source of truth for identity, orgs, billing, keys)
        │
        │  maps 1:1
        ▼
MLflow data plane workspace (source of truth for experiments, runs, models, traces, artifacts)
```

| Concept | Lives in | Public ID | Maps to |
| --- | --- | --- | --- |
| User | Control plane | `usr_<ulid>` | Identity provider subject |
| Organization | Control plane | `org_<ulid>` | Billing customer, entitlement root. **Not** an MLflow object |
| Organization membership | Control plane | — | Role in the org |
| Tensorlane workspace | Control plane | `ws_<ulid>` | **Exactly one** MLflow workspace |
| MLflow workspace | MLflow `workspaces` table | DNS-1123 name | Data-plane isolation key |
| API key | Control plane | `tl_live_…` / `tl_test_…` | Principal + org + optional workspace scope |
| Experiment, run, model, trace, artifact, prompt, eval | MLflow DB / object store | MLflow native IDs | Isolated by MLflow workspace name |

Organizations are **not** MLflow workspaces. An org contains many workspaces:

```text
Acme Corporation          org_01h...
├── Production            ws_01h...  →  MLflow workspace "ws-01h..."
├── Staging               ws_01h...  →  MLflow workspace "ws-01j..."
├── Research              ws_01h...  →  MLflow workspace "ws-01k..."
└── Agent Development     ws_01h...  →  MLflow workspace "ws-01m..."
```

---

## 3. Why not reuse MLflow workspace names as user-facing names?

MLflow workspace names are globally unique (table PK is `name`) and must match:

```text
^[a-z0-9]([-a-z0-9]*[a-z0-9])?$   length 2–63
```

Underscores are **illegal**. Tensorlane public IDs (`ws_01H...`) therefore **cannot** be used verbatim.

User-facing names like `Production` are **not unique across organizations** (every customer will create “Production”).

**Decision:** store a dedicated `mlflow_workspace_name` on the Tensorlane workspace row. Generate it from the public ID with a reversible, valid encoding:

```text
ws_01HXYZ...  →  ws-01hxyz...     (lowercased, '_' → '-')
```

Display name (`Production`) is control-plane metadata only. The MLflow SDK sees the encoded name if the user calls `mlflow.set_workspace(...)`. Workspace-scoped API keys hide this from most users (see §6).

---

## 4. Control-plane entities (logical)

Public IDs are ULIDs with prefixes. **Never expose sequential database primary keys.**

| Entity | Notes |
| --- | --- |
| `User` | `usr_…`. Email, IdP subject, status. Soft-deletable. |
| `Organization` | `org_…`. Immutable ID. Mutable display name. Stripe customer id (nullable until billed). |
| `OrganizationMembership` | `(org, user, role, status)`. Roles: Owner, Admin, Developer, Viewer, Billing. |
| `Workspace` | `ws_…`. Belongs to one org. `mlflow_workspace_name`, display name, status, artifact prefix. |
| `WorkspaceMembership` | Optional finer-than-org access. Phase 1 may grant all org members access to all org workspaces except Viewer-limited; Phase 4 adds per-workspace RBAC. |
| `APIKey` | Prefix `tl_live_` / `tl_test_`. Store **hash only** (HMAC or salted hash). Metadata: name, created_by, created_at, last_used_at, expires_at, permissions, workspace_scope, revoked_at. |
| `ServiceAccount` | Org-owned non-human principal. Keys attach to it. |
| `Plan` / `Subscription` / `EntitlementSnapshot` | See billing ADR. |
| `UsageRecord` | Idempotent meter events. |
| `AuditEvent` | Append-only, no secrets. |
| `TenantConfiguration` | Isolation mode (`shared` vs `dedicated`), storage backend, retention. |

Role logic lives in one module: `authorize(principal, action, resource, organization, workspace=None)`. Handlers do not inline role checks.

---

## 5. Data-plane binding

On Tensorlane workspace create:

1. Insert control-plane `Workspace`.
2. Call MLflow `create_workspace(name=mlflow_workspace_name, default_artifact_root=s3://…/org/{org_id}/workspace/{ws_id})`.
3. MLflow therefore isolates SQL rows via `workspace` column / joins, and artifacts via a **tenant-owned prefix** without appending a second `/workspaces/` segment.

On Tensorlane workspace delete:

1. Soft-delete control-plane row.
2. MLflow `delete_workspace` with an explicit mode (`RESTRICT` vs `CASCADE`).
3. Enqueue artifact purge / retention job. Do not silently destroy production data; honor plan retention.

MLflow `default` workspace: **do not use it for customer data**. Tensorlane Cloud always creates explicit workspaces. Disable `grant_default_workspace_access` in auth config. Optionally keep MLflow’s reserved `default` row empty.

---

## 6. Request resolution (who / org / workspace)

```text
MLflow SDK
  MLFLOW_TRACKING_URI=https://api.tensorlane.ai
  MLFLOW_TRACKING_TOKEN=tl_live_...
        │
        ▼
Tensorlane Gateway
  1. Authenticate token (hashed lookup)
  2. Load principal, org, plan, key.workspace_scope
  3. Resolve workspace
  4. authorize(...)
  5. EntitlementService.isOverLimit(...)  (soft/hard per metric)
  6. Overwrite X-MLFLOW-WORKSPACE with the authorized mlflow_workspace_name
  7. Record request_id; enqueue usage (async)
  8. Proxy to MLflow data plane
        │
        ▼
MLflow (--enable-workspaces)
  ContextVar = injected workspace
  WorkspaceAwareSqlAlchemyStore filters SQL
  Artifact repo writes only under that workspace root
```

### Workspace resolution order

1. **Workspace-scoped API key** — the key’s workspace is authoritative. Ignore a conflicting client `X-MLFLOW-WORKSPACE` (confused-deputy defense). Mismatch → 403.
2. **Explicit client workspace** — `mlflow.set_workspace(...)` / `MLFLOW_WORKSPACE` / header, if the principal may access it.
3. **Single remaining workspace** for that principal in the org — use it (golden-path: one org, one workspace, one key).
4. Else **400** with `WORKSPACE_REQUIRED`.

Gateway **always** sets the header to the encoded MLflow name. MLflow must not trust an unauthenticated header.

Dashboard sessions use the same resolver with a user session instead of an API key.

---

## 7. Authorization

```text
authorize(principal, action, resource, organization, workspace=None)
```

Phase 1 org roles:

| Role | Typical actions |
| --- | --- |
| Owner | All, including delete org, transfer ownership, billing |
| Admin | Members, workspaces, keys, settings; not billing-only surfaces unless granted |
| Developer | Create/read/write tracking resources in permitted workspaces; create keys for self/service within policy |
| Viewer | Read-only tracking resources |
| Billing | Subscription, invoices, usage; no experiment mutation |

Resource kinds include `organization`, `workspace`, `api_key`, `member`, `experiment`, `run`, `model`, `artifact`, `trace`, `prompt`, `evaluation`, `audit_event`.

MLflow’s built-in RBAC (READ/USE/EDIT/MANAGE on experiments and models) is **finer-grained inside a workspace**. Phase 1: Tensorlane roles are the coarse gate; optionally map Developer → MLflow workspace `USE` + resource EDIT, Viewer → READ, Admin/Owner → MANAGE. Phase 4 can expose MLflow roles in the Tensorlane UI.

**Never** use MLflow `users.is_admin` (super-admin) for customer principals.

---

## 8. Isolation properties

| Layer | Mechanism |
| --- | --- |
| Identity | Token/session → one org (keys cannot span orgs) |
| Gateway | Rejects cross-org IDs; overwrites workspace header |
| MLflow SQL | `WorkspaceAwareSqlAlchemyStore` filters |
| Artifacts | Prefix `org/{org_id}/workspace/{ws_id}/`; signed URLs only; validate paths |
| Lists | MLflow already filters by workspace; Tensorlane list APIs filter by org membership |
| Dedicated enterprise | Separate Postgres + bucket + encryption config (`TenantConfiguration.isolation_mode=dedicated`) |

**Known upstream limits (accepted, mitigated):**

- Experiment IDs are **global integers**. Guessable. Mitigation: workspace filter on every get; never return another workspace’s experiment as 403 with existence leak if we can return 404. Prefer 404 for cross-workspace gets.
- No FK from experiments to `workspaces`. Mitigation: Tensorlane only creates workspaces through the control plane; do not allow customers to create raw MLflow workspaces that bypass org mapping.
- Auth post-filters some lists. Mitigation: Tensorlane Cloud uses gateway + workspace-aware store, not “list everything then hide in React”.

---

## 9. Cross-tenant tests (mandatory)

Automated tests must attempt and **fail** each of:

| Attacker | Target |
| --- | --- |
| Org A user | Org B experiment, run, model, trace, artifact, members, API |
| Org A API key | Org B run / artifact / model |
| Org A workspace header | Org B MLflow workspace name |
| Org A admin | Org B members / audit / billing |
| Workspace-scoped key for A | Header `X-MLFLOW-WORKSPACE: <B>` |

Also reuse upstream workspace isolation tests against the Tensorlane-composed server.

Treat any pass as a **critical security vulnerability**.

---

## 10. Deletion

| Object | Phase 1 behavior |
| --- | --- |
| API key | Immediate revoke (`revoked_at`); hash remains for audit of “which key” not the secret |
| User | Soft-delete; memberships disabled; keys revoked |
| Workspace | Soft-delete control plane; MLflow delete with restrict unless force+cascade; artifact purge job |
| Organization | Block if workspaces remain (or cascade with explicit confirmation); cancel Stripe; retain audit per policy |

Enterprise retention policies come in Phase 4. Do not hard-delete audit events in Phase 1.

---

## 11. What we will not do

- Put `organization_id` on MLflow `experiments` / `runs` / `trace_info`.
- Use frontend workspace dropdowns as the only isolation.
- Let clients supply arbitrary S3 keys or `artifact_location`.
- Share one MLflow workspace across two Tensorlane orgs.
- Use sequential integer org IDs in URLs or API keys.
