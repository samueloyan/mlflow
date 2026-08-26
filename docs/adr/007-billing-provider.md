# ADR 007 — Billing provider

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Phase 2 must move money and keep `Organization.plan` truthful without putting Stripe on the MLflow hot path or trusting the browser.

## Context

ADR 005 already chose a central `EntitlementService` and idempotent `UsageRecord` rows. Stripe Checkout, Customer Portal, and webhooks still need a provider boundary so local development and CI do not require live keys.

## Options

1. **Stripe SDK on every request** — couples p99 of tracking writes to a vendor.
2. **Provider protocol (`SandboxBilling` | `StripeBilling`)** — Checkout and Portal go through the provider; subscription state changes only from verified webhooks (or an equivalent sandbox completion that we issued).
3. **Client-sent plan field** — trivial to forge.

## Decision

Choose **option 2**.

- `BillingProvider.create_checkout` / `create_portal` / `parse_webhook`.
- If `STRIPE_SECRET_KEY` is unset, `SandboxBilling` issues `cs_test_{org_suffix}_{plan}` session ids. Completing that session is the only way to change plan in sandbox.
- Stripe webhooks: verify `t=` / `v1=` HMAC, persist `stripe_events.id` as the idempotency key, ignore duplicates, copy `metadata.plan` we set at checkout — never a client-supplied plan on the webhook body as the sole source of truth.
- Entitlements stay a snapshot of `organizations.plan`. The gateway never calls Stripe.

## Tradeoffs

- Cached plan can lag a few seconds after upgrade. Accept; the billing UI refreshes after redirect.
- Sandbox session format is guessable if an attacker knows the org id suffix. Completing checkout still requires an authenticated `billing.manage` principal for that organization.

## Consequences

- No Stripe imports in `mlflow/` or on the proxy hot path.
- Tests cover invalid signatures, duplicate event ids, and Org A/Org B billing isolation.
- Enterprise remains sales-led (no self-serve Checkout).
