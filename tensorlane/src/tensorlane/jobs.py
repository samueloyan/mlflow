"""Postgres-backed control-plane jobs. Redis is optional; this table is the source of truth."""

from __future__ import annotations

import logging
from datetime import timedelta
from typing import Any, Callable

from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from tensorlane.clock import utcnow
from tensorlane.config import get_settings
from tensorlane.db.models import AlertEvent, AlertRule, Job, Organization, Workspace
from tensorlane.entitlements import EntitlementService
from tensorlane.ids import ALERT_EVENT_PREFIX, JOB_PREFIX, new_id
from tensorlane.mlflow_admin import admin_from_settings
from tensorlane.notify import deliver_webhook
from tensorlane.services import set_usage, usage_sum
from tensorlane.storage import measure_bytes, purge_older_than

log = logging.getLogger("tensorlane.jobs")

Handler = Callable[[Session, Job], None]
MAINTENANCE_KINDS = ("alerts.evaluate", "retention.scan", "storage.inventory")
MAINTENANCE_EVERY_SECONDS = 15 * 60


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
        message = f"{rule.name}: {rule.metric} is {current} (threshold {rule.threshold})."
        event = AlertEvent(
            id=new_id(ALERT_EVENT_PREFIX),
            rule_id=rule.id,
            organization_id=org_id,
            value=current,
            message=message,
        )
        session.add(event)
        session.flush()
        if rule.delivery_url:
            delivered = deliver_webhook(
                rule.delivery_url,
                {
                    "id": event.id,
                    "organization_id": org_id,
                    "rule_id": rule.id,
                    "name": rule.name,
                    "metric": rule.metric,
                    "value": current,
                    "threshold": rule.threshold,
                    "message": message,
                },
            )
            log.info(
                "alert_delivered id=%s ok=%s",
                event.id,
                delivered,
            )


def _retention_scan(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    settings = get_settings()
    admin = admin_from_settings(settings)
    now = utcnow()
    runs_ms = int((now - timedelta(days=org.retention_runs_days)).timestamp() * 1000)
    traces_ms = int((now - timedelta(days=org.retention_traces_days)).timestamp() * 1000)
    deleted_runs = 0
    deleted_traces = 0
    deleted_files = 0
    workspaces = session.scalars(
        select(Workspace).where(
            Workspace.organization_id == org.id,
            Workspace.deleted_at.is_(None),
        )
    ).all()
    for workspace in workspaces:
        deleted_runs += admin.delete_runs_older_than(workspace.mlflow_workspace_name, runs_ms)
        deleted_traces += admin.delete_traces_older_than(workspace.mlflow_workspace_name, traces_ms)
        deleted_files += purge_older_than(workspace.artifact_root, org.retention_artifacts_days)
    job.payload = {
        **(job.payload or {}),
        "deleted_runs": deleted_runs,
        "deleted_traces": deleted_traces,
        "deleted_files": deleted_files,
    }
    log.info(
        "retention_scan organization_id=%s traces_days=%s runs_days=%s artifacts_days=%s "
        "deleted_runs=%s deleted_traces=%s deleted_files=%s",
        org.id,
        org.retention_traces_days,
        org.retention_runs_days,
        org.retention_artifacts_days,
        deleted_runs,
        deleted_traces,
        deleted_files,
    )


def _storage_inventory(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    workspaces = session.scalars(
        select(Workspace).where(
            Workspace.organization_id == org.id,
            Workspace.deleted_at.is_(None),
        )
    ).all()
    total = 0
    for workspace in workspaces:
        total += measure_bytes(workspace.artifact_root)
    gigabytes = total / 1_000_000_000
    set_usage(session, org.id, "storage_gb", gigabytes, f"storage:{org.id}")
    entitlements = EntitlementService(org.plan)
    over = entitlements.is_over_limit("storage_gb", gigabytes)
    job.payload = {
        **(job.payload or {}),
        "bytes": total,
        "storage_gb": gigabytes,
        "over_limit": over,
    }
    log.info(
        "storage_inventory organization_id=%s bytes=%s storage_gb=%s over_limit=%s",
        org.id,
        total,
        gigabytes,
        over,
    )


def _isolation_provision(session: Session, job: Job) -> None:
    org_id = job.organization_id
    if not org_id:
        return
    org = session.get(Organization, org_id)
    if org is None:
        return
    log.info(
        "isolation_provision organization_id=%s mode=%s note=shared_store_until_dedicated_cluster",
        org.id,
        org.isolation_mode,
    )


HANDLERS: dict[str, Handler] = {
    "usage.rollup": _usage_rollup,
    "alerts.evaluate": _evaluate_alerts,
    "retention.scan": _retention_scan,
    "storage.inventory": _storage_inventory,
    "isolation.provision": _isolation_provision,
}


def _has_recent_maintenance(session: Session, organization_id: str, kind: str) -> bool:
    cutoff = utcnow() - timedelta(seconds=MAINTENANCE_EVERY_SECONDS)
    row = session.scalar(
        select(Job).where(
            Job.organization_id == organization_id,
            Job.kind == kind,
            or_(
                Job.status.in_(("queued", "running")),
                Job.finished_at >= cutoff,
            ),
        )
    )
    return row is not None


def schedule_maintenance(session: Session) -> int:
    """Enqueue periodic alert/retention/inventory jobs when none are in flight."""
    orgs = session.scalars(select(Organization).where(Organization.deleted_at.is_(None))).all()
    created = 0
    for org in orgs:
        for kind in MAINTENANCE_KINDS:
            if _has_recent_maintenance(session, org.id, kind):
                continue
            enqueue(session, kind=kind, payload={"source": "schedule"}, organization_id=org.id)
            created += 1
    return created


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
