# Tensorlane Security Model

**Status:** Proposed (Phase 0). Do not implement until architecture approval.

Related: [tenant-model.md](./tenant-model.md), [ADR 001](./adr/001-tenant-isolation.md), [ADR 004](./adr/004-authentication.md).

---

## 1. Threat model (initial)

Assume customers store proprietary models, prompts, traces, datasets, and artifacts.

| Threat | Mitigation |
| --- | --- |
| Cross-tenant read/write | Gateway authz + MLflow workspace SQL filters + artifact prefix checks + mandatory tests |
| Stolen API key | Hash-at-rest, prefix-only display, revoke, expiry, last_used_at, workspace scope |
| Confused deputy via `X-MLFLOW-WORKSPACE` | Gateway overwrites header; scoped keys ignore client workspace |
| Path traversal / SSRF on artifacts and webhooks | Reuse MLflow `validate_path_is_safe` and webhook SSRF guards; never follow client-supplied fetch URLs into cloud metadata |
| Billing fraud | Stripe webhooks signature-verified, idempotent; never trust browser subscription state |
| Credential stuffing | IdP rate limits, lockout via provider; do not roll our own password DB crypto |
| Secret leakage in logs | Deny-list; structured logging without Authorization, cookies, tokens |
| XSS / CSRF / clickjacking | Tensorlane UI CSP, CSRF on cookie sessions; MLflow security middleware for data plane |
| Supply-chain | Pin deps, cooldown already in MLflow `pyproject.toml` / npmrc; add scanning before production |

---

## 2. Authentication

### 2.1 Human users (control plane)

Do **not** use MLflow Basic Auth users as the SaaS identity store.

Use an established identity provider behind an internal `IdentityProvider` interface so SAML/OIDC/SCIM can be added in Phase 4 without rewriting orgs.

Phase 1 methods:

- Email/password (provider-hosted)
- Google, GitHub, Microsoft OAuth

Phase 4:

- SAML 2.0, OIDC, SCIM, domain verification, enforced SSO, JIT provisioning

Session: HTTP-only, Secure, SameSite cookies for the dashboard. CSRF on browser mutations.

**Vendor choice is an open question** (WorkOS vs Clerk vs Better Auth / Auth.js). See [phase-0-findings.md](./phase-0-findings.md) §P.

### 2.2 API / SDK

MLflow already sends `MLFLOW_TRACKING_TOKEN` as a Bearer token. Tensorlane keys:

```text
tl_live_<secret>
tl_test_<secret>
```

- Return the secret **once** at creation.
- Persist `key_prefix` (for UI) + `key_hash` (for lookup).
- Optional `expires_at`, `workspace_id` scope, permission claims.
- Update `last_used_at` asynchronously.
- Service accounts are org-owned principals that hold keys.

Do not implement password hashing ourselves for API keys; use a standard KDF/HMAC (for example HMAC-SHA256 with a server-side pepper in a secrets manager, or argon2id). Pepper lives outside the database.

MLflow `authorization_function` on the data plane should **not** independently parse customer passwords. Prefer: gateway authenticates, then forwards to MLflow with an internal credential (mTLS or a rotation-friendly shared service token) that the data plane trusts only from the gateway network.

### 2.3 Service-to-service

Gateway → MLflow: private network. MLflow is not directly on the public internet in production.

---

## 3. Authorization

Single function:

```text
authorize(principal, action, resource, organization, workspace=None) -> None
```

Raises a typed error (`WORKSPACE_ACCESS_DENIED`, `ORGANIZATION_ACCESS_DENIED`, …) that Tensorlane APIs serialize as:

```json
{
  "error": {
    "code": "WORKSPACE_ACCESS_DENIED",
    "message": "You do not have permission to access this workspace.",
    "request_id": "req_01h..."
  }
}
```

Never return stack traces to clients.

UI hides nav items based on entitlements, but **every** API repeats the check.

---

## 4. Tenant isolation

See [tenant-model.md](./tenant-model.md). Summary:

1. Keys and sessions are org-scoped.
2. Gateway binds exactly one MLflow workspace name per request (or fails).
3. MLflow `WorkspaceAwareSqlAlchemyStore` filters SQL.
4. Object keys are prefixed `org/{org_id}/workspace/{ws_id}/`.
5. Signed URLs are short-lived and bound to that prefix.
6. Dedicated isolation mode uses separate DB + bucket.

---

## 5. Artifact security

- Disable client-specified `artifact_location` (already rejected when workspaces are enabled).
- Validate object keys against the workspace prefix before signing.
- Upload size limits from `EntitlementService`.
- Do not expose raw bucket names or cloud credentials to the browser.
- Future: customer-managed buckets (Phase 4/5) with strict assume-role, not long-lived keys in the browser.

---

## 6. Secrets and logging

**Never log:** passwords, API keys, OAuth tokens, session secrets, database credentials, cloud credentials, Stripe secret keys, webhook signing secrets, raw Authorization headers.

Log: `request_id`, `trace_id`, `organization_id`, `workspace_id`, principal type, route, status, latency.

Audit events record **that** a key was created/revoked, not the secret.

MLflow webhook secret encryption uses Fernet (`MLFLOW_WEBHOOK_SECRET_ENCRYPTION_KEY`). Tensorlane integration credentials use the control-plane secrets manager, not application config files.

---

## 7. Web and network controls

| Control | Phase 1 |
| --- | --- |
| TLS | Required at the edge. No plaintext public HTTP. |
| CORS | Explicit dashboard origin(s). Never `*` in production. |
| CSP | Strict on Tensorlane UI. |
| Cookies | Secure, HttpOnly, SameSite |
| CSRF | Dashboard cookie auth |
| Host header | Reuse MLflow allowed-hosts on the data plane; gateway has its own allowlist |
| Rate limit | By IP, user, API key, organization, endpoint class (ingestion vs dashboard) |
| WAF / CDN | Production; not required for local compose |

MLflow ingestion (traces, metrics) needs **different** limits than dashboard CRUD.

---

## 8. Rate limiting and abuse

Redis for counters (not source of truth). Policies are named and config-driven, not a single global QPS.

Classes:

- `auth` — login, signup
- `control_plane` — org/workspace/key APIs
- `mlflow_read` — search, get
- `mlflow_write` — create run, log batch
- `trace_ingest` — high volume
- `artifact_sign` — upload/download URL minting

---

## 9. Audit logging

Append-only control-plane table (and later cold storage). Fields:

`actor`, `organization_id`, `workspace_id`, `action`, `resource`, `resource_id`, `timestamp`, `ip`, `user_agent`, `result`, `metadata`, `request_id`

Example actions: `member.invited`, `api_key.created`, `api_key.revoked`, `workspace.created`, `sso.updated`.

No secrets in `metadata`. Immutable from the product API (no update/delete for customers).

---

## 10. Observability of the platform

OpenTelemetry-compatible instrumentation. Every request: `request_id` (and `trace_id` when propagated).

Monitor: request volume, error rate, p50/p95/p99, DB latency, storage latency, MLflow API latency, trace ingest throughput, queue depth, billing webhook failures, authentication failures.

Tenant resolution and metering **must not** add unbounded latency to `log_metric` / trace ingest. Meter asynchronously when correctness allows; enforce hard limits with a cached entitlement snapshot.

---

## 11. Dependency and license hygiene

- Keep upstream Apache 2.0 notices and Databricks copyright headers on MLflow files.
- Add `NOTICE` attributing MLflow / Databricks for the distribution.
- Separate Tensorlane proprietary license for `tensorlane/` (to be chosen; legal).
- Do not imply Databricks or MLflow endorses Tensorlane.
- **Trademark:** Apache 2.0 §6 grants no trademark rights. “MLflow” branding/trademark needs **human legal review** before marketing, logos, or domain copy. Product name is **Tensorlane**. Compatibility language: “MLflow compatible.”
- Do not claim SOC 2 / ISO / GDPR certification until obtained. Design for evidence (audit logs, access logs, change records).

---

## 12. Production gate (from the mission brief)

Do not accept paying customers until:

- Tenant isolation tests pass
- TLS, secrets manager, rate limits, sanitized logs
- Backup + restore procedure exists (even if first restore is a documented drill)
- Stripe webhooks verified in a non-prod Stripe account
- API key revoke/rotation works
- Artifact signed-URL permissions tested
- Audit logging works
- Upstream compatibility suite passes
- Dependency and container scanning enabled

---

## 13. Explicit non-goals for Phase 1

- Building our own IdP or SAML stack
- Custom cryptography
- Postgres RLS as the first isolation mechanism (app filters + gateway first; RLS can be a later defense in depth)
- Public MLflow data plane
- Mixing Stripe state from the browser into entitlements
