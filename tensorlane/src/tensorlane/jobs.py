"""Postgres-backed control-plane jobs. Redis is optional; this table is the source of truth."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Callable

from sqlalchemy import select
from sqlalchemy.orm import Session

from tensorlane.clock import utcnow
from tensorlane.db.models import AlertEvent, AlertRule, Job, Organization
from tensorlane.entitlements import EntitlementService
from tensorlane.ids import ALERT_EVENT_PREFIX, JOB_PREFIX, new_id
from tensorlane.services import usage_sum

log = logging.getLogger("tensorlane.jobs")

Handler = Callable[[Session, Job], None]


def enqueue(
    session: Session,
    *,
    kind: str,
    payload: dict[str, Any] | None = None,
    organization_id: str | None = None,
    delay_seconds: int = 0,
) -> Job:
    job = Job(
        id=new_id(JOB_PREFIX),
        organization_id=organization_id,
        kind=kind,
        status="queued",
        payload=payload or {},
        run_after=utcnow() + timedelta(seconds=delay_seconds),
        attempts=0,
    )
    session.add(job)
    session.flush()
    return job


def claim_next(session: Session) -> Job | None:
    stmt = (
        select(Job)
        .where(Job.status == "queued", Job.run_after <= utcnow())
        .order_by(Job.run_after.asc())
        .limit(1)
    )
    bind = session.get_bind()
    if bind is not None and bind.dialect.name == "postgresql":
        stmt = stmt.with_for_update(skip_locked=True)
    job = session.scalar(stmt)
    if job is None:
        return None
    job.status = "running"
    job.started_at = utcnow()
    job.attempts += 1
    session.flush()
    return job


def _usage_rollup(session: Session, job: Job) -> None:
    _ = job
    # Usage is already written idempotently on the request path.
    return


def _evaluate_alerts(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    rules = session.scalars(
        select(AlertRule).where(AlertRule.organization_id == org_id, AlertRule.enabled.is_(True))
    ).all()
    for rule in rules:
        current = usage_sum(session, org_id, rule.metric)
        fired = current >= rule.threshold if rule.operator == "gte" else current <= rule.threshold
        if not fired:
            continue
        recent = session.scalar(
            select(AlertEvent).where(
                AlertEvent.rule_id == rule.id,
                AlertEvent.created_at >= utcnow() - timedelta(hours=max(rule.window_hours, 1)),
            )
        )
        if recent is not None:
            continue
        session.add(
            AlertEvent(
                id=new_id(ALERT_EVENT_PREFIX),
                rule_id=rule.id,
                organization_id=org_id,
                value=current,
                message=f"{rule.name}: {rule.metric} is {current} (threshold {rule.threshold}).",
            )
        )


def _retention_scan(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    log.info(
        "retention_scan organization_id=%s traces_days=%s runs_days=%s artifacts_days=%s",
        org.id,
        org.retention_traces_days,
        org.retention_runs_days,
        org.retention_artifacts_days,
    )


def _storage_inventory(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    EntitlementService(org.plan)
    log.info("storage_inventory organization_id=%s", org.id)


def _isolation_provision(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    log.info("isolation_provision organization_id=%s mode=%s", org.id, org.isolation_mode)


HANDLERS: dict[str, Handler] = {
    "usage.rollup": _usage_rollup,
    "alerts.evaluate": _evaluate_alerts,
    "retention.scan": _retention_scan,
    "storage.inventory": _storage_inventory,
    "isolation.provision": _isolation_provision,
}


def run_once(session: Session) -> Job | None:
    job = claim_next(session)
    if job is None:
        return None
    handler = HANDLERS.get(job.kind)
    try:
        if handler is None:
            raise RuntimeError(f"Unknown job kind {job.kind}")
        handler(session, job)
        job.status = "succeeded"
        job.finished_at = utcnow()
        job.error = None
    except Exception as exc:
        log.exception("job_failed id=%s kind=%s", job.id, job.kind)
        job.status = "failed" if job.attempts >= 5 else "queued"
        job.error = str(exc)
        job.run_after = utcnow() + timedelta(seconds=min(300, 5 * job.attempts))
        job.finished_at = utcnow() if job.status == "failed" else None
    return job
