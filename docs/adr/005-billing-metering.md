# ADR 005 — Billing and metering

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Usage and entitlements must exist from day one so later Stripe integration is not a rewrite, without scattering `if plan == "growth"` through MLflow handlers.

## Context

MLflow has no plans, Stripe, or usage tables. Tracing and artifact volume can be large; metering on the hot path can add latency.

Plans: Free, Team, Growth, Enterprise (prices not hardcoded).

## Options

1. **Check Stripe on every MLflow request**  
   Slow, brittle, vendor lock-in on the hot path.

2. **Central `EntitlementService` with a cached snapshot; async `UsageRecord` ingestion**  
   Source of truth in Postgres; Redis optional for counters; Stripe for money movement only.

3. **Frontend-only usage charts**  
   Useless for billing integrity.

## Decision

Choose **option 2**.

```text
EntitlementService
  canUse(feature)
  getLimit(metric)
  getCurrentUsage(metric)
  isOverLimit(metric)
```

Plan documents are data (JSON/config), not `if` statements in handlers.

Usage events: `{organization_id, workspace_id, metric, quantity, timestamp, idempotency_key}`. Writers on the gateway (request counts) and workers (storage bytes). Idempotent upserts.

Limit behavior is per metric: warn at 80%, at 100% allow overage / throttle / soft / hard / require upgrade — **configurable**, defaulting to **not destroying running workloads** (prefer soft limit + banner for tracking writes unless abuse is clear).

Stripe (Phase 2): Checkout, subscriptions, portal, invoices, webhooks. Webhooks: signature verify, idempotency key (`event.id`), log, retry-safe. Subscription state in the control plane DB, not the browser.

## Tradeoffs

- Cached entitlements can lag a few seconds after upgrade. Accept; webhook + explicit refresh on checkout success.
- Async metering can under-count on crash. Mitigate with at-least-once events + idempotency keys.
- Hard-stopping trace ingest at 100% may drop production observability. Default to overage or soft limit for `traces`; hard-limit storage if cost is unbounded.

## Consequences

- No plan enums in `mlflow/` .
- Billing tests use Stripe test clocks / fixtures, not production.
- Metering must not dominate p99 of `log_metric` / trace ingest (budget a small fixed overhead for cache hit).
