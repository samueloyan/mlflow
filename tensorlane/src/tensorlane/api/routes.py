from __future__ import annotations

import re
from datetime import datetime
from typing import Any

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, EmailStr, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from tensorlane.api.deps import (
    Principal,
    TenantContext,
    get_principal,
    mlflow_admin_dep,
    resolve_tenant,
    settings_dep,
)
from tensorlane.authz import authorize
from tensorlane.clock import utcnow
from tensorlane.config import Settings
from tensorlane.db.models import (
    ApiKey,
    AuditEvent,
    Organization,
    OrganizationMembership,
    UsageRecord,
    User,
    Workspace,
)
from tensorlane.db.session import get_session
from tensorlane.entitlements import EntitlementService
from tensorlane.errors import ConflictError, NotFoundError
from tensorlane.ids import (
    AUDIT_PREFIX,
    MEMBERSHIP_PREFIX,
    ORG_PREFIX,
    USAGE_PREFIX,
    WORKSPACE_PREFIX,
    new_id,
    new_ulid,
    to_mlflow_workspace_name,
)
from tensorlane.mlflow_admin import MlflowAdmin
from tensorlane.services import (
    api_key_role,
    count_members,
    count_owners,
    create_api_key,
    get_organization,
    usage_sum,
)

router = APIRouter(prefix="/api/v1")


def _slugify(value: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", value.lower()).strip("-")
    return (slug or "item")[:48]


def _request_id(request: Request) -> str:
    return getattr(request.state, "request_id", "req_unknown")


def _audit(
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
            request_id=_request_id(request),
        )
    )


def _record_usage(
    session: Session,
    organization_id: str,
    workspace_id: str | None,
    metric: str,
    quantity: float,
    idempotency_key: str,
) -> None:
    existing = session.scalar(
        select(UsageRecord).where(UsageRecord.idempotency_key == idempotency_key)
    )
    if existing is not None:
        return
    session.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=organization_id,
            workspace_id=workspace_id,
            metric=metric,
            quantity=quantity,
            idempotency_key=idempotency_key,
        )
    )


class CreateOrganizationBody(BaseModel):
    name: str = Field(min_length=1, max_length=256)


class OrganizationOut(BaseModel):
    id: str
    name: str
    slug: str
    plan: str


class CreateWorkspaceBody(BaseModel):
    name: str = Field(min_length=1, max_length=256)
    organization_id: str


class WorkspaceOut(BaseModel):
    id: str
    organization_id: str
    name: str
    slug: str
    mlflow_workspace_name: str
    artifact_root: str


class InviteMemberBody(BaseModel):
    email: EmailStr
    role: str


class UpdateMemberBody(BaseModel):
    role: str


class MemberOut(BaseModel):
    user_id: str
    email: str
    role: str


class CreateApiKeyBody(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    organization_id: str
    workspace_id: str | None = None
    live: bool = True


class ApiKeyCreatedOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    secret: str
    workspace_id: str | None


class ApiKeyOut(BaseModel):
    id: str
    name: str
    key_prefix: str
    workspace_id: str | None
    created_at: datetime
    last_used_at: datetime | None
    revoked_at: datetime | None


class UsageOut(BaseModel):
    plan: str
    metrics: dict[str, Any]


@router.get("/me")
def me(
    principal: Principal = Depends(get_principal), session: Session = Depends(get_session)
) -> dict[str, Any]:
    assert principal.user_id is not None
    user = session.get(User, principal.user_id)
    memberships = session.scalars(
        select(OrganizationMembership).where(OrganizationMembership.user_id == principal.user_id)
    ).all()
    return {
        "id": principal.user_id,
        "email": user.email if user else principal.email,
        "name": user.name if user else "",
        "organizations": [
            {
                "id": m.organization_id,
                "role": m.role,
            }
            for m in memberships
        ],
    }


@router.post("/organizations", status_code=201)
def create_organization(
    body: CreateOrganizationBody,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> OrganizationOut:
    if principal.user_id is None:
        raise NotFoundError("User required.")
    slug = _slugify(body.name)
    clash = session.scalar(select(Organization).where(Organization.slug == slug))
    if clash is not None:
        slug = f"{slug}-{new_ulid().lower()[:6]}"
    org = Organization(id=new_id(ORG_PREFIX), name=body.name, slug=slug, plan="free")
    session.add(org)
    session.add(
        OrganizationMembership(
            id=new_id(MEMBERSHIP_PREFIX),
            organization_id=org.id,
            user_id=principal.user_id,
            role="owner",
        )
    )
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="organization.created",
        resource="organization",
        resource_id=org.id,
    )
    session.flush()
    return OrganizationOut(id=org.id, name=org.name, slug=org.slug, plan=org.plan)


@router.get("/organizations")
def list_organizations(
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[OrganizationOut]:
    if principal.user_id is None:
        return []
    rows = session.scalars(
        select(Organization)
        .join(OrganizationMembership)
        .where(
            OrganizationMembership.user_id == principal.user_id,
            Organization.deleted_at.is_(None),
        )
    ).all()
    return [OrganizationOut(id=o.id, name=o.name, slug=o.slug, plan=o.plan) for o in rows]


@router.get("/organizations/{organization_id}")
def get_org(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> OrganizationOut:
    org = get_organization(session, organization_id)
    if principal.user_id:
        membership = session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == principal.user_id,
            )
        )
        authorize(
            role=membership.role if membership else None,
            action="organization.read",
            organization_id=org.id,
            resource_organization_id=org.id,
        )
    elif principal.api_key is None or principal.api_key.organization_id != org.id:
        authorize(
            role=None,
            action="organization.read",
            organization_id=org.id,
            resource_organization_id=org.id,
        )
    return OrganizationOut(id=org.id, name=org.name, slug=org.slug, plan=org.plan)


@router.post("/workspaces", status_code=201)
def create_workspace(
    body: CreateWorkspaceBody,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    mlflow: MlflowAdmin = Depends(mlflow_admin_dep),
) -> WorkspaceOut:
    org = get_organization(session, body.organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="workspace.create",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    workspace_id = new_id(WORKSPACE_PREFIX)
    mlflow_name = to_mlflow_workspace_name(workspace_id)
    artifact_root = f"{settings.artifact_root.rstrip('/')}/org/{org.id}/workspace/{workspace_id}"
    slug = _slugify(body.name)
    existing = session.scalar(
        select(Workspace).where(Workspace.organization_id == org.id, Workspace.slug == slug)
    )
    if existing is not None:
        slug = f"{slug}-{workspace_id[-4:]}"
    workspace = Workspace(
        id=workspace_id,
        organization_id=org.id,
        name=body.name,
        slug=slug,
        mlflow_workspace_name=mlflow_name,
        artifact_root=artifact_root,
    )
    session.add(workspace)
    session.flush()
    mlflow.create_workspace(mlflow_name, artifact_root, body.name)
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=workspace.id,
        action="workspace.created",
        resource="workspace",
        resource_id=workspace.id,
    )
    return WorkspaceOut(
        id=workspace.id,
        organization_id=org.id,
        name=workspace.name,
        slug=workspace.slug,
        mlflow_workspace_name=workspace.mlflow_workspace_name,
        artifact_root=workspace.artifact_root,
    )


@router.get("/workspaces")
def list_workspaces(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[WorkspaceOut]:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="workspace.read",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    rows = session.scalars(
        select(Workspace).where(
            Workspace.organization_id == org.id,
            Workspace.deleted_at.is_(None),
        )
    ).all()
    return [
        WorkspaceOut(
            id=w.id,
            organization_id=w.organization_id,
            name=w.name,
            slug=w.slug,
            mlflow_workspace_name=w.mlflow_workspace_name,
            artifact_root=w.artifact_root,
        )
        for w in rows
    ]


@router.get("/organizations/{organization_id}/members")
def list_members(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[MemberOut]:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="members.read",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    members = session.scalars(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == org.id)
    ).all()
    out: list[MemberOut] = []
    for member in members:
        user = session.get(User, member.user_id)
        out.append(
            MemberOut(user_id=member.user_id, email=user.email if user else "", role=member.role)
        )
    return out


@router.post("/organizations/{organization_id}/members", status_code=201)
def invite_member(
    organization_id: str,
    body: InviteMemberBody,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> MemberOut:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="members.invite",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    entitlements = EntitlementService(org.plan)
    entitlements.enforce("members", float(count_members(session, org.id)), incoming=1)
    user = session.scalar(select(User).where(User.email == str(body.email).lower()))
    if user is None:
        raise NotFoundError("User must sign up before being added to an organization.")
    if session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user.id,
        )
    ):
        raise ConflictError("User is already a member.")
    if body.role not in {"admin", "developer", "viewer", "billing"}:
        raise ConflictError("Invalid role.")
    membership = OrganizationMembership(
        id=new_id(MEMBERSHIP_PREFIX),
        organization_id=org.id,
        user_id=user.id,
        role=body.role,
    )
    session.add(membership)
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="member.invited",
        resource="member",
        resource_id=user.id,
    )
    return MemberOut(user_id=user.id, email=user.email, role=body.role)


@router.patch("/organizations/{organization_id}/members/{user_id}")
def update_member(
    organization_id: str,
    user_id: str,
    body: UpdateMemberBody,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> MemberOut:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="members.change_role",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise NotFoundError("Member not found.")
    allowed = {"admin", "developer", "viewer", "billing"}
    if role == "owner":
        allowed = allowed | {"owner"}
    if body.role not in allowed:
        raise ConflictError("Invalid role.")
    if membership.role == "owner" and body.role != "owner" and count_owners(session, org.id) <= 1:
        raise ConflictError("Organizations must keep at least one owner.")
    membership.role = body.role
    user = session.get(User, user_id)
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="member.role_changed",
        resource="member",
        resource_id=user_id,
    )
    return MemberOut(user_id=user_id, email=user.email if user else "", role=membership.role)


@router.delete("/organizations/{organization_id}/members/{user_id}", status_code=204)
def remove_member(
    organization_id: str,
    user_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="members.remove",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise NotFoundError("Member not found.")
    if membership.role == "owner" and count_owners(session, org.id) <= 1:
        raise ConflictError("Organizations must keep at least one owner.")
    session.delete(membership)
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="member.removed",
        resource="member",
        resource_id=user_id,
    )


@router.post("/api-keys", status_code=201)
def create_key(
    body: CreateApiKeyBody,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> ApiKeyCreatedOut:
    org = get_organization(session, body.organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="api_key.create",
        organization_id=org.id,
        resource_organization_id=org.id,
        workspace_id=body.workspace_id,
        resource_workspace_id=body.workspace_id,
    )
    if principal.api_key is not None and principal.api_key.workspace_id:
        if body.workspace_id != principal.api_key.workspace_id:
            raise NotFoundError("Workspace not found.")
    if body.workspace_id:
        workspace = session.get(Workspace, body.workspace_id)
        if workspace is None or workspace.organization_id != org.id:
            raise NotFoundError("Workspace not found.")
    assert principal.user_id is not None
    row, secret = create_api_key(
        session,
        organization_id=org.id,
        created_by=principal.user_id,
        name=body.name,
        workspace_id=body.workspace_id,
        pepper=settings.tensorlane_pepper,
        live=body.live,
        role=role,
    )
    _audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=body.workspace_id,
        action="api_key.created",
        resource="api_key",
        resource_id=row.id,
    )
    return ApiKeyCreatedOut(
        id=row.id,
        name=row.name,
        key_prefix=row.key_prefix,
        secret=secret,
        workspace_id=row.workspace_id,
    )


@router.get("/api-keys")
def list_keys(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[ApiKeyOut]:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="api_key.read",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    rows = session.scalars(select(ApiKey).where(ApiKey.organization_id == org.id)).all()
    return [
        ApiKeyOut(
            id=k.id,
            name=k.name,
            key_prefix=k.key_prefix,
            workspace_id=k.workspace_id,
            created_at=k.created_at,
            last_used_at=k.last_used_at,
            revoked_at=k.revoked_at,
        )
        for k in rows
    ]


@router.delete("/api-keys/{key_id}", status_code=204)
def revoke_key(
    key_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    key = session.get(ApiKey, key_id)
    if key is None:
        raise NotFoundError("API key not found.")
    role = _role_for(session, principal, key.organization_id)
    authorize(
        role=role,
        action="api_key.revoke",
        organization_id=key.organization_id,
        resource_organization_id=key.organization_id,
    )
    key.revoked_at = utcnow()
    _audit(
        session,
        request,
        principal=principal,
        organization_id=key.organization_id,
        workspace_id=key.workspace_id,
        action="api_key.revoked",
        resource="api_key",
        resource_id=key.id,
    )


@router.get("/usage")
def get_usage(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> UsageOut:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="usage.read",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    entitlements = EntitlementService(org.plan)
    metrics = {}
    for metric in entitlements._doc["limits"]:
        current = usage_sum(session, org.id, metric)
        if metric == "members":
            current = float(count_members(session, org.id))
        limit = entitlements.get_limit(metric)
        metrics[metric] = {
            "current": current,
            "limit": limit,
            "warning": entitlements.is_warning(metric, current),
            "over_limit": entitlements.is_over_limit(metric, current),
            "behavior": entitlements.get_behavior(metric),
        }
    return UsageOut(plan=org.plan, metrics=metrics)


@router.get("/audit-events")
def list_audit(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = get_organization(session, organization_id)
    role = _role_for(session, principal, org.id)
    authorize(
        role=role,
        action="audit.read",
        organization_id=org.id,
        resource_organization_id=org.id,
    )
    rows = session.scalars(
        select(AuditEvent)
        .where(AuditEvent.organization_id == org.id)
        .order_by(AuditEvent.created_at.desc())
        .limit(100)
    ).all()
    return [
        {
            "id": row.id,
            "action": row.action,
            "resource": row.resource,
            "resource_id": row.resource_id,
            "actor_user_id": row.actor_user_id,
            "result": row.result,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "request_id": row.request_id,
        }
        for row in rows
    ]


@router.get("/entitlements/{organization_id}")
def entitlements(
    organization_id: str,
    tenant: TenantContext = Depends(resolve_tenant),
) -> dict[str, Any]:
    authorize(
        role=tenant.role,
        action="organization.read",
        organization_id=tenant.organization.id,
        resource_organization_id=organization_id,
    )
    service = EntitlementService(tenant.organization.plan)
    return {
        "plan": service.plan,
        "features": service._doc["features"],
        "limits": service._doc["limits"],
    }


def _role_for(session: Session, principal: Principal, organization_id: str) -> str | None:
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
