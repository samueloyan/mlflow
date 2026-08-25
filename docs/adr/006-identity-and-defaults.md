# ADR 006 — Identity vendor and product defaults

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Phase 0 left identity vendor, workspace ACL, quota behavior, API hostname, and frontend shell open.

## Context

Tensorlane already owns organizations, workspaces, and RBAC. Human login must support email/password plus Google, GitHub, and Microsoft now, and SAML/OIDC/SCIM later, without a second org system.

## Options (identity)

1. **Clerk** — fastest hosted UI; Clerk Organizations would duplicate Tensorlane orgs; MAU pricing; user PII in a third party.
2. **Better Auth** — self-hosted, Postgres-backed, email + social, bearer plugin, SSO plugin path; we build the login UI.
3. **WorkOS** — strongest enterprise SSO/SCIM; heavier than Phase 1 needs.

## Decision

**Better Auth** for humans. Tensorlane tables for orgs/workspaces/keys. Do **not** enable Better Auth’s organization plugin.

Rationale: first-class experience comes from Tensorlane’s product, not from renting a second tenancy model. Passwords stay hashed by Better Auth (no custom crypto). Sessions live in our database. Phase 4 can add the Better Auth SSO plugin or WorkOS behind the same `IdentityProvider` boundary if counsel prefers a hosted IdP for SAML.

Other defaults:

| Topic | Choice |
| --- | --- |
| Upstream pin | Current distribution SHA (`3.15.2.dev0` / `627d1ebd0`). Future syncs prefer **stable tags**, never reset backward. |
| Frontend | Separate Next.js app. Tensorlane chrome + proxied MLflow UI at `/tracking`. |
| Public API | Single host `https://api.tensorlane.ai` (MLflow + `/api/v1` + dashboard). |
| Workspace ACL | Org members access **all** workspaces in the org. `workspace_memberships` exists for later restriction. Roles still apply. |
| Quotas at 100% | Warn at 80% on every metric. Traces and runs: **soft** (allow overage). API requests: **throttle** (HTTP 429). Storage and member seats: **hard**. |
| `tensorlane/` license | Proprietary (all rights reserved). `mlflow/` remains Apache 2.0. |

## Tradeoffs

- We must design login/signup ourselves (do it to a high standard).
- Soft trace limits can incur cost; storage hard-stop protects the bill.
- Open workspace ACL is simpler for teams; enterprises will want per-workspace grants in Phase 4.

## Consequences

- Python control plane resolves humans via Better Auth `sessions` (cookie or Bearer) and machines via `tl_live_` / `tl_test_` keys.
- Gateway is the only public process; MLflow binds to loopback.
