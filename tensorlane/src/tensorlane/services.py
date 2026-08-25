from __future__ import annotations

import hashlib
import hmac

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tensorlane.authz import ORG_ROLES
from tensorlane.clock import utcnow
from tensorlane.db.models import ApiKey, Organization, OrganizationMembership, User, Workspace
from tensorlane.errors import AuthenticationError, AuthorizationError, NotFoundError
from tensorlane.ids import (
    API_KEY_ID_PREFIX,
    is_tensorlane_api_key,
    new_api_key_secret,
    new_id,
)


def hash_api_key(raw_key: str, pepper: str) -> str:
    return hmac.new(pepper.encode("utf-8"), raw_key.encode("utf-8"), hashlib.sha256).hexdigest()


def create_api_key(
    session: Session,
    *,
    organization_id: str,
    created_by: str,
    name: str,
    workspace_id: str | None,
    pepper: str,
    live: bool = True,
    role: str = "developer",
) -> tuple[ApiKey, str]:
    snapshot_role = role if role in ORG_ROLES else "developer"
    raw = new_api_key_secret(live=live)
    row = ApiKey(
        id=new_id(API_KEY_ID_PREFIX),
        organization_id=organization_id,
        workspace_id=workspace_id,
        name=name,
        key_prefix=raw[:16],
        key_hash=hash_api_key(raw, pepper),
        created_by=created_by,
        permissions={"role": snapshot_role},
    )
    session.add(row)
    session.flush()
    return row, raw


def resolve_api_key(session: Session, raw_key: str, pepper: str) -> ApiKey:
    if not is_tensorlane_api_key(raw_key):
        raise AuthenticationError("Invalid API key.")
    digest = hash_api_key(raw_key, pepper)
    key = session.scalar(select(ApiKey).where(ApiKey.key_hash == digest))
    if key is None or key.revoked_at is not None:
        raise AuthenticationError("Invalid API key.")
    if key.expires_at is not None and key.expires_at <= utcnow():
        raise AuthenticationError("API key expired.")
    key.last_used_at = utcnow()
    return key


def get_membership(session: Session, user_id: str, organization_id: str) -> OrganizationMembership:
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == user_id,
            OrganizationMembership.organization_id == organization_id,
        )
    )
    if membership is None:
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "You do not have permission to access this organization.",
        )
    return membership


def get_organization(session: Session, organization_id: str) -> Organization:
    org = session.get(Organization, organization_id)
    if org is None or org.deleted_at is not None:
        raise NotFoundError("Organization not found.")
    return org


def get_workspace(session: Session, workspace_id: str) -> Workspace:
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.deleted_at is not None:
        raise NotFoundError("Workspace not found.")
    return workspace


def workspace_by_mlflow_name(session: Session, name: str) -> Workspace | None:
    return session.scalar(
        select(Workspace).where(
            Workspace.mlflow_workspace_name == name,
            Workspace.deleted_at.is_(None),
        )
    )


def count_owners(session: Session, organization_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(OrganizationMembership)
            .where(
                OrganizationMembership.organization_id == organization_id,
                OrganizationMembership.role == "owner",
            )
        )
        or 0
    )


def api_key_role(key: ApiKey) -> str:
    stored = (key.permissions or {}).get("role")
    if stored in ORG_ROLES:
        return str(stored)
    return "developer"


def count_members(session: Session, organization_id: str) -> int:
    return int(
        session.scalar(
            select(func.count())
            .select_from(OrganizationMembership)
            .where(OrganizationMembership.organization_id == organization_id)
        )
        or 0
    )


def usage_sum(session: Session, organization_id: str, metric: str) -> float:
    from tensorlane.db.models import UsageRecord

    total = session.scalar(
        select(func.coalesce(func.sum(UsageRecord.quantity), 0)).where(
            UsageRecord.organization_id == organization_id,
            UsageRecord.metric == metric,
        )
    )
    return float(total or 0)


def get_user(session: Session, user_id: str) -> User:
    user = session.get(User, user_id)
    if user is None:
        raise NotFoundError("User not found.")
    return user
