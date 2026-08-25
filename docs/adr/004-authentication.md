# ADR 004 — Authentication

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Tensorlane needs human login (email + social, later SSO) and machine auth that the **unmodified** MLflow SDK can use (`MLFLOW_TRACKING_TOKEN`).

## Context

MLflow Basic Auth is username/password in a separate SQLite/SQL DB, pluggable `authorization_function`, no first-party API keys, no SSO. The Python SDK already supports Bearer tokens via `MLFLOW_TRACKING_TOKEN`.

Building password storage or SAML ourselves is forbidden by product principles.

## Options

1. **Extend MLflow `users` table** with OAuth fields and API keys  
   Couples identity to the data plane; fights upstream auth migrations.

2. **Control-plane identity + gateway Bearer tokens; MLflow data plane trusts only the gateway**  
   Clear boundary. SDK-compatible. SSO added behind `IdentityProvider`.

3. **Put Clerk/Auth0 in front of MLflow UI only; SDK still uses Basic Auth**  
   Splits human vs machine identity awkwardly.

## Decision

Choose **option 2**.

- Humans authenticate to the **control plane** via **Better Auth** (email/password + Google/GitHub/Microsoft). Tensorlane owns organizations; do not enable Better Auth’s organization plugin. Interface: `IdentityProvider`.
- Machines use `tl_live_` / `tl_test_` keys; only hashes stored.
- Gateway validates the token, authorizes, injects workspace, proxies to MLflow.
- MLflow `--app-name` plugin (Tensorlane) rejects direct public access; accepts gateway-internal identity.
- Do not seed customer users into MLflow `users`.

Phase 4: SAML/OIDC/SCIM through the same `IdentityProvider` (WorkOS-class), not a custom IdP.

## Tradeoffs

- Local dev needs the gateway, not only `mlflow server`.
- Login UI is ours to design (see Tensorlane web). SSO later uses the same `IdentityProvider` boundary.
- Lost keys cannot be recovered (show once). Document rotation.

## Consequences

- Dashboard cookie sessions never travel to MLflow as the customer’s password.
- API key permissions and workspace_scope are control-plane fields.
- Authn failures are metrics + audit (without secrets).
