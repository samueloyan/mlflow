# ADR 001 — Tenant isolation

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Tensorlane must isolate organizations and workspaces on shared infrastructure without forking MLflow’s schema or breaking the Python SDK.

## Context

MLflow 3.10+ already has **workspaces**: a `workspace` column (or join via `experiments.workspace`), header `X-MLFLOW-WORKSPACE`, and `WorkspaceAwareSqlAlchemyStore`. There are **no organizations**. Workspace names are globally unique DNS-1123 labels. Experiment IDs are global integers. Resource tables have no FK to `workspaces`. Isolation is query filtering, not RLS.

## Options

1. **Schema-per-org or database-per-org for every customer**  
   Strong isolation, operationally heavy for the long tail, slow to provision, painful for cross-workspace product features later.

2. **Add `organization_id` to every MLflow table**  
   Tight coupling, fights upstream migrations, unmaintainable fork.

3. **Map each Tensorlane workspace 1:1 to an MLflow workspace; organizations live only in the control plane**  
   Reuses upstream filters and per-workspace `default_artifact_root`. Gateway authenticates and binds the workspace header.

4. **Process-per-tenant MLflow servers**  
   Isolation by process. Cost and orchestration complexity too high for shared SaaS Phase 1.

## Decision

Choose **option 3** for shared SaaS.

- Control plane owns orgs, membership, keys, billing.
- Each Tensorlane workspace has `mlflow_workspace_name` derived from `ws_<ulid>` (lowercase, `_` → `-`).
- Artifact root: `s3://$BUCKET/org/{org_id}/workspace/{ws_id}`.
- Dedicated enterprise later uses option 1 **selectively** (`TenantConfiguration.isolation_mode=dedicated`) without changing the programming model.

## Tradeoffs

- Experiment IDs remain globally sequential (information leak of existence if we return 403 instead of 404). Accept; return 404 for cross-workspace gets.
- A bug in gateway header injection is fatal. Mitigate with tests and by failing closed when workspace context is missing (`WorkspaceAwareMixin` already errors if unset).
- MLflow workspace names leak into SDK users who call `set_workspace`. Mitigate with workspace-scoped API keys as the default golden path.

## Consequences

- Do not modify upstream tracking tables for tenancy.
- Mandatory org-vs-org isolation tests before Phase 1 is done.
- Workspace create/delete is a dual write (control plane + MLflow). Needs idempotent orchestration.
