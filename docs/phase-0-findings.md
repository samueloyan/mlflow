# Phase 0 findings (architecture approval required)

**Status:** Approved. Phase 1 implementation follows these findings and ADRs.

**Decisions (2026-08-25):** Better Auth; separate Next.js app + proxied MLflow UI; single host `api.tensorlane.ai`; org-wide workspace access; soft limits on traces/runs; throttled API requests; hard limits on storage/seats; pin current SHA (do not reset to v3.15.1). See [ADR 006](./adr/006-identity-and-defaults.md).

Inspected repository: `samueloyan/mlflow` at `627d1ebd0` (`3.15.2.dev0`). Latest stable upstream release: **MLflow 3.15.1**. No Tensorlane code exists yet.

Companion docs:

- [mlflow-upstream-architecture.md](./mlflow-upstream-architecture.md)
- [tensorlane-architecture.md](./tensorlane-architecture.md)
- [tenant-model.md](./tenant-model.md)
- [security-model.md](./security-model.md)
- [upstream-sync.md](./upstream-sync.md)
- [licensing-and-trademarks.md](./licensing-and-trademarks.md)
- [adr/](./adr/)

---

## A. Current MLflow architecture

MLflow 3.x is a **single tracking server** (FastAPI wrapping Flask) plus a Python/JS SDK and UI.

- **CLI:** `mlflow server` (`mlflow/cli/__init__.py`) starts uvicorn by default (`mlflow.server.fastapi_app:app`).
- **REST:** protobuf services → `mlflow/server/handlers.py` on `/api/{2,3}.0/mlflow/...` and `/ajax-api/...`.
- **Stores:** `AbstractStore` → PostgreSQL `SqlAlchemyStore`, optional `WorkspaceAwareSqlAlchemyStore`, FileStore, RestStore (client).
- **Workspaces (3.10+, experimental):** header `X-MLFLOW-WORKSPACE`, ContextVar, SQL filters, per-workspace artifact roots. Names are DNS-1123, globally unique. **Not organizations.**
- **Auth:** optional `--app-name basic-auth`. HTTP Basic, Werkzeug hashes, RBAC roles. Pluggable `authorization_function`. No first-party API keys or SSO.
- **Artifacts:** `ArtifactRepository` + S3/GCS/Azure; presigned URLs; `--serve-artifacts` proxy.
- **Registry / prompts / traces / eval / gateway / MCP / jobs / webhooks** are already in-tree.
- **UI:** React 18 in `mlflow/server/js` with Databricks design system, workspace selector, experiment/run/trace/model/prompt surfaces.
- **Plugins:** `mlflow.app`, tracking/registry/artifact/workspace stores, request header/auth providers, scorers.

Details and file map: [mlflow-upstream-architecture.md](./mlflow-upstream-architecture.md).

---

## B. Reusable MLflow capabilities

Use unchanged:

| Capability | Why it matters |
| --- | --- |
| Python SDK `import mlflow` + `MLFLOW_TRACKING_TOKEN` | Zero-client-migration tracking |
| Tracking + registry REST | Compatibility |
| PostgreSQL + Alembic | Metadata at scale |
| Native workspaces + `WorkspaceAwareSqlAlchemyStore` | Server-side isolation we would otherwise reinvent |
| Per-workspace `default_artifact_root` | Tenant object prefixes without custom URI schemes |
| S3 repo + presigned multipart | Artifact performance |
| Tracing + OTLP + assessments | AI observability foundation |
| Prompts as registered models | Prompt versioning/aliases |
| GenAI evaluate/scorers/datasets | Evaluation foundation |
| `mlflow.app` + `authorization_function` | Attach Tensorlane without editing handlers |
| Existing workspace isolation tests | Regression net for the data plane |
| Compose (Postgres + S3-compatible) and Helm | Starting points, not the final product |

---

## C. Tensorlane-specific components required

New, outside `mlflow/`:

- Gateway (public edge)
- Control plane (orgs, members, workspaces mapping, keys, audit)
- Identity adapter (email + Google/GitHub/Microsoft; SSO later)
- EntitlementService + plan documents
- Usage metering (async, idempotent)
- Stripe integration (Phase 2)
- Artifact provider wrapper (signed URLs, limits, metering hooks)
- Tensorlane dashboard (org/billing/keys/overview)
- Redis workers for control-plane jobs
- Tensorlane SDK + CLI (not a replacement MLflow SDK)
- Isolation + compatibility + golden-path tests
- Observability (OTel) and rate-limit policies

---

## D. Proposed repository architecture

Distribution fork with a hard boundary (ADR 002):

```text
mlflow/          upstream, no drive-by edits
tensorlane/      proprietary packages (control plane, gateway, web, jobs)
tests/tensorlane/
deploy/compose/
docs/            architecture + ADRs
```

Remotes: `origin` = Tensorlane; add `upstream` = `https://github.com/mlflow/mlflow.git`.

---

## E. Database architecture

| DB | Schema owner | Notes |
| --- | --- | --- |
| `mlflow` | Upstream Alembic | Tracking, registry, `workspaces`, jobs. **No org_id columns.** |
| `tensorlane` | Tensorlane Alembic | Users, orgs, memberships, workspace map, hashed API keys, plans, usage, audit, Stripe IDs |

Same Postgres instance for shared SaaS. Dedicated enterprise: dedicated instance. Redis is not durable source of truth.

MLflow auth DB is unused for Cloud customers.

---

## F. Tenant isolation architecture

ADR 001 + [tenant-model.md](./tenant-model.md):

- Org is control-plane only (`org_<ulid>`).
- Tensorlane workspace (`ws_<ulid>`) ↔ exactly one MLflow workspace named `ws-<ulid-lower>`.
- Gateway overwrites `X-MLFLOW-WORKSPACE`; workspace-scoped keys ignore client headers.
- SQL isolation via upstream workspace filters.
- Artifacts under `s3://bucket/org/{org_id}/workspace/{ws_id}/`.
- Mandatory cross-org tests.

---

## G. Authentication architecture

ADR 004:

- Humans: hosted IdP via `IdentityProvider` (vendor TBD).
- Machines: `tl_live_` / `tl_test_`; hash at rest; SDK uses `MLFLOW_TRACKING_TOKEN`.
- Gateway authenticates; MLflow trusts gateway-internal identity only (private network).
- Central `authorize(principal, action, resource, organization, workspace=None)`.
- Roles: Owner, Admin, Developer, Viewer, Billing.

---

## H. MLflow compatibility strategy

Do not fork the SDK. Compose:

```text
SDK → https://api.tensorlane.ai → Gateway → MLflow (--enable-workspaces)
```

Compatibility suite on every CI and every upstream merge. Keep MLflow error JSON on MLflow routes. Tensorlane `/api/v1` uses the typed error envelope.

---

## I. Artifact storage architecture

ADR 003: S3-compatible provider; set workspace `default_artifact_root` so MLflow does not double-prefix `/workspaces/`. Signed URLs after authz. Meter storage asynchronously. Keep MLflow key suffix `{experiment_id}/{run_id}/artifacts`.

---

## J. Billing architecture

ADR 005: `EntitlementService` + plan JSON. Usage events idempotent. Stripe in Phase 2, webhooks verified. No plan `if` in `mlflow/`. Soft-limit defaults so ingest is not killed by surprise.

---

## K. Security risks

| Risk | Severity | Mitigation |
| --- | --- | --- |
| Unauthenticated `X-MLFLOW-WORKSPACE` on stock MLflow | Critical if exposed | Never expose data plane; gateway binds header |
| Sequential global `experiment_id` | Medium (enumeration) | Workspace filters; 404 on cross-tenant get |
| No FK to `workspaces` | Medium | Only create workspaces via control plane |
| Auth fail-open on some MLflow routes | High | Fail-closed plugin; gateway is the public ACL |
| `--serve-artifacts` as bandwidth path | Medium | Presigned URLs |
| Logging tokens | High | Deny-list, audit without secrets |
| Shared-bucket prefix bugs | Critical | Sign-path prefix checks + tests |
| Trademark/endorsement | Legal | Human review ([licensing-and-trademarks.md](./licensing-and-trademarks.md)) |
| Embedding Databricks-branded UI | Legal/UX | Tensorlane chrome; counsel on design-system vendor |

---

## L. Upstream synchronization strategy

[upstream-sync.md](./upstream-sync.md): fetch `upstream`, merge **release tags** into an integration branch, run compatibility + isolation tests, then merge to product main. Empty patch register. Separate `tensorlane/pyproject.toml` to avoid fighting root `pyproject.toml`.

---

## M. Implementation phases (small, reviewable)

**Phase 0 (this PR):** documentation only. **Approval gate.**

**Phase 1a — Skeleton**  
`tensorlane/` package, Compose (postgres, redis, s3, mlflow with workspaces, empty gateway), seed script.  
PR sized to “stack boots.”

**Phase 1b — Identity + orgs**  
Users, orgs, memberships, `authorize()`, org APIs. No MLflow yet.

**Phase 1c — Workspaces mapping**  
Create Tensorlane workspace → `mlflow.create_workspace` + artifact root. Dual-write idempotency.

**Phase 1d — API keys + gateway**  
Hashed keys, Bearer auth, header bind, proxy tracking APIs.

**Phase 1e — Dashboard shell**  
Sign-in, org/workspace switch, keys, embed/proxy MLflow UI.

**Phase 1f — Isolation + compatibility tests**  
Org A vs Org B matrix; SDK golden path. **Phase 1 done when these pass.**

**Phase 2** — Entitlements, usage events, Stripe, audit API/UI, billing portal.

**Phase 3** — Productize tracing/prompts/eval (mostly UI + search/filter + comparisons on upstream data).

**Phase 4** — SSO/SCIM, dedicated isolation, advanced RBAC, retention.

**Phase 5** — Differentiation (monitoring, cost, approvals).

Do not implement 1b–5 in one PR.

---

## N. Exact files/modules expected to change (later)

Phase 0: **none** of `mlflow/`.

After approval, expected **edits** (not wholesale rewrites):

| Path | Why |
| --- | --- |
| Root CI workflows (`.github/workflows/*`) | Add Tensorlane test jobs (additive YAML) |
| `.gitignore` | Tensorlane local artifacts if needed |

**Avoid changing:** `mlflow/store/tracking/dbmodels/models.py`, `mlflow/server/handlers.py`, `mlflow/server/js/**` except later, optional, narrowly scoped chrome/branding behind flags — and only with an ADR.

If entry points cannot live in a separate package, a one-line `pyproject.toml` entry point is a tracked patch.

---

## O. Exact files/modules expected to be created (Phase 1)

```text
tensorlane/pyproject.toml
tensorlane/control_plane/          app, models, migrations, routers (orgs, workspaces, keys, members)
tensorlane/control_plane/authz.py  authorize()
tensorlane/control_plane/ids.py    ulid prefixes
tensorlane/gateway/                proxy, rate limit, tenant context
tensorlane/data_plane/app.py       mlflow.app factory
tensorlane/identity/               IdentityProvider
tensorlane/entitlements/           plans, EntitlementService
tensorlane/storage/s3.py
tensorlane/jobs/
tensorlane/web/                    dashboard app
tests/tensorlane/isolation/
tests/tensorlane/compatibility/
tests/tensorlane/api/
deploy/compose/docker-compose.yml
deploy/compose/seed/
NOTICE                             Databricks/MLflow attribution
docs/upstream-pin.md               SHA/tag pin
```

Phase 2 adds `tensorlane/billing/` (Stripe webhooks).

---

## P. Open architectural questions

Approval should explicitly resolve:

1. **Upstream pin:** stay on this `master` (`3.15.2.dev0`) or reset the product line to tag `v3.15.1`?
2. **Identity vendor:** WorkOS (SSO-ready) vs Clerk vs self-hosted Better Auth / Auth.js?
3. **Dashboard:** Next.js (or similar) for Tensorlane web vs extending `mlflow/server/js` in-tree? (Recommendation: separate web app + proxy MLflow UI.)
4. **Public API host:** single host `api.tensorlane.ai` for both MLflow and `/api/v1`, vs `api.` + `app.` split?
5. **Phase 1 workspace ACL:** all org members see all org workspaces, or WorkspaceMembership from day one?
6. **Default limit at 100% traces:** soft vs overage vs throttle?
7. **Proprietary license** for `tensorlane/` (BSL, commercial, Apache-with-commons, …)?
8. **Trademark counsel** sign-off on “MLflow compatible” and UI that still contains MLflow strings in embedded views.
9. **Whether origin stays `samueloyan/mlflow`** or moves to a Tensorlane GitHub org before Phase 1 publicity.
10. **Job runner:** ARQ vs Celery vs RQ for control-plane workers?

---

## Approval request

Please approve or amend:

- ADRs 001–005
- Tenant mapping (org in control plane, 1:1 MLflow workspace)
- Gateway-in-front compatibility (no SDK fork)
- Separate `tensorlane/` tree (no core MLflow rewrite)
- Phase 1 sliced as 1a–1f above

**No application code will be written until that approval.**
