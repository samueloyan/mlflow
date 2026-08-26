"""Shared control-plane helpers."""

from __future__ import annotations

from fastapi import Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from tensorlane.api.deps import Principal
from tensorlane.db.models import AuditEvent, OrganizationMembership, WorkspaceMembership
from tensorlane.ids import AUDIT_PREFIX, new_id
from tensorlane.services import api_key_role


def request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "req_unknown")


def audit(
    session: Session,
    request: Request,
    *,
    principal: Principal,
    organization_id: str | None,
    workspace_id: str | None,
    action: str,
    resource: str,
    resource_id: str | None,
) -> None:
    session.add(
        AuditEvent(
            id=new_id(AUDIT_PREFIX),
            actor_user_id=principal.user_id,
            actor_key_id=principal.api_key.id if principal.api_key else None,
            organization_id=organization_id,
            workspace_id=workspace_id,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent"),
            result="success",
            extra={},
            request_id=request_id(request),
        )
    )


def role_for(session: Session, principal: Principal, organization_id: str) -> str | None:
    if principal.api_key is not None:
        if principal.api_key.organization_id != organization_id:
            return None
        return api_key_role(principal.api_key)
    if principal.user_id is None:
        return None
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == organization_id,
            OrganizationMembership.user_id == principal.user_id,
        )
    )
    return membership.role if membership else None


def workspace_visible(
    session: Session,
    *,
    organization_id: str,
    workspace_id: str,
    user_id: str | None,
    workspace_acl: str,
    role: str | None = None,
) -> bool:
    _ = organization_id
    if workspace_acl != "restricted" or user_id is None:
        return True
    if role in {"owner", "admin"}:
        return True
    grant = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user_id,
        )
    )
    return grant is not None


def audit_system(
    session: Session,
    *,
    organization_id: str | None,
    action: str,
    resource: str,
    resource_id: str | None,
    request_id_value: str = "req_system",
) -> None:
    session.add(
        AuditEvent(
            id=new_id(AUDIT_PREFIX),
            actor_user_id=None,
            actor_key_id=None,
            organization_id=organization_id,
            workspace_id=None,
            action=action,
            resource=resource,
            resource_id=resource_id,
            ip=None,
            user_agent=None,
            result="success",
            extra={},
            request_id=request_id_value,
        )
    )


def require_action(
    session: Session, principal: Principal, organization_id: str, action: str
) -> str:
    from tensorlane.authz import authorize

    role = role_for(session, principal, organization_id)
    authorize(
        role=role,
        action=action,
        organization_id=organization_id,
        resource_organization_id=organization_id,
    )
    assert role is not None
    return role


def serialize_org(org) -> dict:
    from tensorlane.entitlements import EntitlementService

    entitlements = EntitlementService(org.plan)
    return {
        "id": org.id,
        "name": org.name,
        "slug": org.slug,
        "plan": org.plan,
        "isolation_mode": org.isolation_mode,
        "workspace_acl": org.workspace_acl,
        "sso_enforced": org.sso_enforced,
        "sso_domain": org.sso_domain,
        "retention_traces_days": org.retention_traces_days,
        "retention_runs_days": org.retention_runs_days,
        "retention_artifacts_days": org.retention_artifacts_days,
        "stripe_customer_id": org.stripe_customer_id,
        "billing_email": org.billing_email,
        "features": entitlements._doc["features"],
        "limits": entitlements._doc["limits"],
    }
