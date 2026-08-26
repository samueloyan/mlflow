# ADR 009 — Workspace ACL modes

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Phase 1 granted every organization member access to every workspace (roles still applied). Enterprises need a restricted mode without a second identity system.

## Context

`workspace_memberships` was reserved in Phase 1. Better Auth has no organization plugin; Tensorlane owns membership. MLflow workspaces remain 1:1 with Tensorlane workspaces; we still do not put `organization_id` on MLflow tables.

## Options

1. **Always org-wide** — too coarse for production isolation inside one company.
2. **Always per-workspace grants** — surprising default; breaks the Phase 1 promise.
3. **Organization setting `workspace_acl`: `org_wide` | `restricted`** — default org-wide; restricted uses `workspace_memberships`. Owners and admins still see every workspace.

## Decision

Choose **option 3**.

- Default for new organizations: `org_wide` (Phase 1 behavior).
- `restricted`: developers, viewers, and billing see only workspaces they are granted. Owners and admins retain org-wide visibility for incident response.
- API keys: workspace-scoped keys remain bound to that workspace; org-scoped keys keep their snapshot role and do not bypass workspace bind on the gateway.
- Dedicated compute isolation (`isolation_mode=dedicated`) is a separate Enterprise feature flag, not an ACL mode.

## Tradeoffs

- Switching an org to `restricted` with no grants hides workspaces from non-admins until an admin assigns them. The settings UI warns before save.
- Per-workspace roles on `workspace_memberships` are informational in this phase; org role remains the authorize() input.

## Consequences

- Gateway `_bind_workspace` and `GET /workspaces` both honor ACL.
- Isolation tests cover Org A/Org B and intra-org restricted grants.
