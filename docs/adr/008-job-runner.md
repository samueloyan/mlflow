# ADR 008 — Control-plane job runner

**Status:** Accepted  
**Date:** 2026-08-25

## Problem

Usage rollups, alert evaluation, retention scans, and storage inventory must run off the request path. Redis is already in Compose for rate limits; it should not become a second source of truth for work.

## Context

Phase 0 left the runner choice open (ARQ vs Celery vs RQ). Tensorlane already persists control-plane state in Postgres. Losing the queue on a Redis flush would strand retention and billing-adjacent work.

## Options

1. **Celery / ARQ / RQ with Redis as the broker** — familiar, extra moving parts, Redis becomes load-bearing.
2. **Postgres `jobs` table as the queue; `tensorlane worker` claims rows** — transactional with the rest of the control plane; Redis optional.
3. **Inline FastAPI BackgroundTasks** — dies with the process; no retry.

## Decision

Choose **option 2**.

```text
jobs (id, organization_id, kind, status, payload, attempts, run_after, error, ...)
```

- Enqueue in the same SQLAlchemy session as the triggering write when practical.
- Worker loop: claim `queued` rows whose `run_after <= now()`, run a registered handler, retry with backoff, mark `failed` after five attempts.
- Redis remains for sliding-window rate limits when `REDIS_URL` is set. It is not the job broker.

Handlers in v1: `usage.rollup`, `alerts.evaluate`, `retention.scan`, `storage.inventory`. Retention currently records policy intent and scans; destructive purge of MLflow rows is a later, explicitly gated step.

## Tradeoffs

- SQLite workers are single-process; Compose runs one `worker` replica against Postgres.
- PostgreSQL claim uses `FOR UPDATE SKIP LOCKED`. SQLite has no skip-locked semantics, so do not run multiple workers against SQLite.

## Consequences

- `tensorlane worker` is a first-class process next to `tensorlane serve`.
- Operators can inspect `/api/v1/jobs` per organization.
- Do not schedule public `/api/v1` routes as jobs; handlers are internal.
