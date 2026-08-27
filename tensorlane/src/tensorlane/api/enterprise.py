"""Phases 2-5 control-plane APIs: billing, invites, SSO, SCIM, retention, approvals, alerts."""

from __future__ import annotations

import re
from collections import defaultdict
from datetime import timedelta
from typing import Any
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, Header, Query, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel, Field
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from tensorlane.api.common import (
    audit,
    audit_system,
    request_id,
    require_action,
    role_for,
    serialize_org,
    workspace_visible,
)
from tensorlane.api.deps import Principal, get_principal, settings_dep
from tensorlane.billing import get_billing
from tensorlane.clock import utcnow
from tensorlane.config import Settings
from tensorlane.crypto import hash_token, new_invite_token, new_scim_token
from tensorlane.db.models import (
    AlertEvent,
    AlertRule,
    Approval,
    Invitation,
    Job,
    Organization,
    OrganizationMembership,
    SavedView,
    ScimToken,
    SsoConnection,
    StripeEvent,
    UsageRecord,
    User,
    Workspace,
    WorkspaceMembership,
)
from tensorlane.db.session import get_session
from tensorlane.entitlements import PLANS, EntitlementService
from tensorlane.errors import (
    AuthenticationError,
    AuthorizationError,
    ConflictError,
    NotFoundError,
    TensorlaneError,
)
from tensorlane.ids import (
    ALERT_PREFIX,
    APPROVAL_PREFIX,
    INVITE_PREFIX,
    MEMBERSHIP_PREFIX,
    SCIM_KEY_PREFIX,
    SCIM_PREFIX,
    SSO_PREFIX,
    USER_PREFIX,
    VIEW_PREFIX,
    WS_MEMBER_PREFIX,
    new_id,
)
from tensorlane.jobs import enqueue
from tensorlane.mail import OutboundEmail, get_mailer
from tensorlane.notify import assert_delivery_url
from tensorlane.services import assert_seat_available, count_owners, get_organization
from tensorlane.storage import assert_artifact_prefix, presign_s3, proxy_url, resolve_local_file
from tensorlane.urls import safe_return_url

router = APIRouter(prefix="/api/v1")
webhook_router = APIRouter()
scim_router = APIRouter(prefix="/scim/v2")
public_router = APIRouter(prefix="/api/v1")

SELF_SERVE_PLANS = frozenset({"free", "team", "growth"})
SSO_PROTOCOLS = frozenset({"oidc", "saml"})
APPROVAL_DECISIONS = frozenset({"approved", "rejected"})
SAVED_VIEW_SURFACES = frozenset({"experiments", "traces", "prompts", "evaluations"})
_SCIM_USERNAME_EQ = re.compile(r'userName\s+eq\s+"([^"]+)"', re.IGNORECASE)


class InvitationCreate(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    role: str = "developer"


class InvitationAcceptIn(BaseModel):
    token: str


class CheckoutIn(BaseModel):
    plan: str
    success_url: str | None = None
    cancel_url: str | None = None


class BillingConfirmIn(BaseModel):
    session_id: str


class OrgPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=256)
    workspace_acl: str | None = None
    isolation_mode: str | None = None
    sso_enforced: bool | None = None
    sso_domain: str | None = None
    retention_traces_days: int | None = Field(default=None, ge=1, le=3650)
    retention_runs_days: int | None = Field(default=None, ge=1, le=3650)
    retention_artifacts_days: int | None = Field(default=None, ge=1, le=3650)
    billing_email: str | None = Field(default=None, min_length=3, max_length=320)


class SsoIn(BaseModel):
    protocol: str = "oidc"
    issuer: str = Field(min_length=8, max_length=512)
    client_id: str = Field(min_length=1, max_length=256)
    client_secret: str | None = None


class ApprovalIn(BaseModel):
    kind: str = Field(min_length=2, max_length=64)
    resource_ref: str = Field(min_length=1, max_length=256)
    note: str = ""
    workspace_id: str | None = None


class ApprovalReviewIn(BaseModel):
    decision: str
    note: str | None = None


class AlertIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    metric: str = Field(min_length=1, max_length=64)
    operator: str = "gte"
    threshold: float
    window_hours: int = Field(default=24, ge=1, le=24 * 90)
    workspace_id: str | None = None
    delivery_url: str | None = Field(default=None, max_length=1024)


class SavedViewIn(BaseModel):
    name: str = Field(min_length=1, max_length=128)
    surface: str
    query: dict[str, Any] = Field(default_factory=dict)
    workspace_id: str | None = None


class WorkspaceMemberIn(BaseModel):
    user_id: str
    role: str = "developer"


class ArtifactSignIn(BaseModel):
    key: str
    workspace_id: str


class ScimTokenIn(BaseModel):
    name: str = Field(default="IdP", min_length=1, max_length=128)


SCIM_ROLE_GROUPS = (
    ("owner", "Owners"),
    ("admin", "Admins"),
    ("developer", "Developers"),
    ("viewer", "Viewers"),
    ("billing", "Billing"),
)
CANCELED_SUBSCRIPTION_EVENTS = frozenset({
    "customer.subscription.deleted",
    "customer.subscription.canceled",
})
CANCELED_SUBSCRIPTION_STATUSES = frozenset({"canceled", "unpaid", "incomplete_expired"})


def _invite_url(settings: Settings, token: str, request: Request) -> str:
    origin = (settings.web_origin or str(request.base_url)).rstrip("/")
    return f"{origin}/invite/{token}"


def _send_invite_mail(
    settings: Settings, *, org_name: str, email: str, role: str, url: str
) -> None:
    get_mailer(settings.smtp_url, settings.mail_from).send(
        OutboundEmail(
            to=email,
            subject=f"Join {org_name} on Tensorlane",
            text=f"You were invited to {org_name} as {role}.\n\nAccept: {url}\n",
        )
    )


def _org(session: Session, organization_id: str) -> Organization:
    return get_organization(session, organization_id)


def _apply_plan(org: Organization, plan: str) -> None:
    if plan not in PLANS:
        raise ConflictError("Unknown plan.")
    org.plan = plan


def _sandbox_plan(session_id: str, organization_id: str) -> str:
    prefix = f"cs_test_{organization_id[-8:]}_"
    if not session_id.startswith(prefix):
        raise ConflictError("Unknown checkout session.")
    plan = session_id[len(prefix) :]
    if plan not in SELF_SERVE_PLANS:
        raise ConflictError("This plan cannot be completed in sandbox checkout.")
    return plan


def _claim_sso_domain(session: Session, org: Organization, domain: str) -> str:
    cleaned = domain.strip().lower()
    if not cleaned or "." not in cleaned or " " in cleaned:
        raise ConflictError("SSO domain must look like example.com.")
    clash = session.scalar(
        select(Organization).where(
            Organization.sso_domain == cleaned,
            Organization.id != org.id,
            Organization.deleted_at.is_(None),
        )
    )
    if clash is not None:
        raise ConflictError("Another organization already claimed this SSO domain.")
    return cleaned


def _validate_issuer(issuer: str, environment: str) -> None:
    parsed = urlparse(issuer)
    if parsed.scheme not in {"https", "http"} or not parsed.netloc:
        raise ConflictError("SSO issuer must be an absolute HTTP(S) URL.")
    if parsed.scheme != "https" and environment == "production":
        raise ConflictError("SSO issuer must use HTTPS in production.")


def _dashboard_url(settings: Settings, request: Request, path: str) -> str:
    origin = str(request.base_url).rstrip("/")
    candidate = f"{(settings.web_origin or origin).rstrip('/')}{path}"
    return safe_return_url(
        candidate,
        origin=origin,
        public_url=settings.public_url,
        extra_origins=[settings.web_origin],
        default_path=path,
    )


def _scim_filter_needle(expression: str | None) -> str:
    if not expression:
        return ""
    match = _SCIM_USERNAME_EQ.search(expression)
    if match:
        return match.group(1).lower()
    return expression.lower()


@public_router.get("/plans")
def list_plans() -> dict[str, Any]:
    return {"plans": EntitlementService.list_plans()}


@public_router.get("/auth/sso-policy")
def sso_policy(email: str, session: Session = Depends(get_session)) -> dict[str, Any]:
    domain = email.split("@")[-1].strip().lower() if "@" in email else ""
    if not domain:
        return {"required": False}
    org = session.scalar(
        select(Organization).where(
            Organization.sso_domain == domain,
            Organization.sso_enforced.is_(True),
            Organization.deleted_at.is_(None),
        )
    )
    if org is None:
        return {"required": False, "domain": domain}
    return {
        "required": True,
        "domain": domain,
        "organization_name": org.name,
        "message": f"{org.name} requires SSO for @{domain} accounts.",
    }


@router.patch("/organizations/{organization_id}")
def patch_organization(
    organization_id: str,
    body: OrgPatch,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "organization.update")
    entitlements = EntitlementService(org.plan)
    if body.isolation_mode == "dedicated":
        entitlements.require_feature("dedicated_isolation")
        require_action(session, principal, org.id, "isolation.manage")
    if body.sso_enforced or body.sso_domain:
        entitlements.require_feature("sso")
        require_action(session, principal, org.id, "sso.manage")
    if any(
        value is not None
        for value in (
            body.retention_traces_days,
            body.retention_runs_days,
            body.retention_artifacts_days,
        )
    ):
        require_action(session, principal, org.id, "retention.manage")
    if body.billing_email is not None:
        require_action(session, principal, org.id, "billing.manage")
        org.billing_email = str(body.billing_email).strip().lower()
    if body.name is not None:
        org.name = body.name
    if body.workspace_acl is not None:
        if body.workspace_acl not in {"org_wide", "restricted"}:
            raise ConflictError("workspace_acl must be org_wide or restricted.")
        org.workspace_acl = body.workspace_acl
    if body.isolation_mode is not None:
        if body.isolation_mode not in {"shared", "dedicated"}:
            raise ConflictError("isolation_mode must be shared or dedicated.")
        org.isolation_mode = body.isolation_mode
        if body.isolation_mode == "dedicated":
            enqueue(session, kind="isolation.provision", payload={}, organization_id=org.id)
    if body.sso_domain is not None:
        cleaned = body.sso_domain.strip()
        org.sso_domain = _claim_sso_domain(session, org, cleaned) if cleaned else None
    if body.sso_enforced is not None:
        if body.sso_enforced and not org.sso_domain:
            raise ConflictError("Set an SSO domain before requiring SSO.")
        org.sso_enforced = body.sso_enforced
    if body.retention_traces_days is not None:
        org.retention_traces_days = body.retention_traces_days
    if body.retention_runs_days is not None:
        org.retention_runs_days = body.retention_runs_days
    if body.retention_artifacts_days is not None:
        org.retention_artifacts_days = body.retention_artifacts_days
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="organization.updated",
        resource="organization",
        resource_id=org.id,
    )
    if any(
        value is not None
        for value in (
            body.retention_traces_days,
            body.retention_runs_days,
            body.retention_artifacts_days,
        )
    ):
        enqueue(session, kind="retention.scan", payload={}, organization_id=org.id)
    session.flush()
    return serialize_org(org)


@router.post("/organizations/{organization_id}/invitations", status_code=201)
def create_invitation(
    organization_id: str,
    body: InvitationCreate,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.invite")
    if body.role not in {"admin", "developer", "viewer", "billing"}:
        raise ConflictError("Invalid role.")
    email = str(body.email).strip().lower()
    if "@" not in email or " " in email:
        raise ConflictError("A valid email is required.")
    assert_seat_available(session, org, incoming=1)
    existing_user = session.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        already = session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.organization_id == org.id,
                OrganizationMembership.user_id == existing_user.id,
            )
        )
        if already is not None:
            raise ConflictError("User is already a member.")
    open_invite = session.scalar(
        select(Invitation).where(
            Invitation.organization_id == org.id,
            Invitation.email == email,
            Invitation.accepted_at.is_(None),
            Invitation.revoked_at.is_(None),
        )
    )
    if open_invite is not None:
        raise ConflictError("An open invitation already exists for this email.")
    assert principal.user_id is not None
    token = new_invite_token()
    invite = Invitation(
        id=new_id(INVITE_PREFIX),
        organization_id=org.id,
        email=email,
        role=body.role,
        token_hash=hash_token(token, settings.tensorlane_pepper),
        invited_by=principal.user_id,
        expires_at=utcnow() + timedelta(days=14),
    )
    session.add(invite)
    url = _invite_url(settings, token, request)
    _send_invite_mail(settings, org_name=org.name, email=email, role=body.role, url=url)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="invitation.created",
        resource="invitation",
        resource_id=invite.id,
    )
    session.flush()
    return {
        "id": invite.id,
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at.isoformat(),
        "accepted_at": None,
        "invite_url": url,
    }


@router.get("/organizations/{organization_id}/invitations")
def list_invitations(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.read")
    rows = session.scalars(
        select(Invitation)
        .where(Invitation.organization_id == org.id)
        .order_by(Invitation.created_at.desc())
    ).all()
    return [
        {
            "id": row.id,
            "email": row.email,
            "role": row.role,
            "expires_at": row.expires_at.isoformat() if row.expires_at else None,
            "accepted_at": row.accepted_at.isoformat() if row.accepted_at else None,
            "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        }
        for row in rows
    ]


@router.post("/organizations/{organization_id}/invitations/{invitation_id}/resend")
def resend_invitation(
    organization_id: str,
    invitation_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.invite")
    invite = session.get(Invitation, invitation_id)
    if invite is None or invite.organization_id != org.id:
        raise NotFoundError("Invitation not found.")
    if invite.accepted_at is not None or invite.revoked_at is not None:
        raise ConflictError("Invitation is no longer open.")
    token = new_invite_token()
    invite.token_hash = hash_token(token, settings.tensorlane_pepper)
    invite.expires_at = utcnow() + timedelta(days=14)
    url = _invite_url(settings, token, request)
    _send_invite_mail(settings, org_name=org.name, email=invite.email, role=invite.role, url=url)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="invitation.resent",
        resource="invitation",
        resource_id=invite.id,
    )
    session.flush()
    return {
        "id": invite.id,
        "email": invite.email,
        "role": invite.role,
        "expires_at": invite.expires_at.isoformat(),
        "invite_url": url,
    }


@router.delete("/organizations/{organization_id}/invitations/{invitation_id}", status_code=204)
def revoke_invitation(
    organization_id: str,
    invitation_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.remove")
    invite = session.get(Invitation, invitation_id)
    if invite is None or invite.organization_id != org.id:
        raise NotFoundError("Invitation not found.")
    if invite.accepted_at is not None:
        raise ConflictError("Invitation already accepted.")
    if invite.revoked_at is None:
        invite.revoked_at = utcnow()
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="invitation.revoked",
        resource="invitation",
        resource_id=invite.id,
    )


@public_router.get("/invitations/preview")
def preview_invitation(
    token: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, Any]:
    invite = session.scalar(
        select(Invitation).where(
            Invitation.token_hash == hash_token(token, settings.tensorlane_pepper)
        )
    )
    if invite is None or invite.revoked_at is not None:
        raise NotFoundError("Invitation not found.")
    org = session.get(Organization, invite.organization_id)
    return {
        "organization_id": invite.organization_id,
        "organization_name": org.name if org else "Organization",
        "email": invite.email,
        "role": invite.role,
        "expired": bool(invite.expires_at and invite.expires_at < utcnow()),
        "accepted": invite.accepted_at is not None,
    }


@router.post("/invitations/accept")
def accept_invitation(
    body: InvitationAcceptIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    invite = session.scalar(
        select(Invitation).where(
            Invitation.token_hash == hash_token(body.token, settings.tensorlane_pepper)
        )
    )
    if invite is None or invite.revoked_at is not None:
        raise NotFoundError("Invitation not found.")
    if invite.accepted_at is not None:
        raise ConflictError("Invitation already accepted.")
    if invite.expires_at < utcnow():
        raise TensorlaneError("INVITATION_EXPIRED", "Invitation expired.", 410)
    if principal.email is None or invite.email != principal.email.lower():
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "This invitation was issued to a different email.",
        )
    assert principal.user_id is not None
    existing = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.user_id == principal.user_id,
            OrganizationMembership.organization_id == invite.organization_id,
        )
    )
    if existing is None:
        org = _org(session, invite.organization_id)
        assert_seat_available(session, org, incoming=1, include_pending=False)
        session.add(
            OrganizationMembership(
                id=new_id(MEMBERSHIP_PREFIX),
                user_id=principal.user_id,
                organization_id=invite.organization_id,
                role=invite.role,
            )
        )
    invite.accepted_at = utcnow()
    audit(
        session,
        request,
        principal=principal,
        organization_id=invite.organization_id,
        workspace_id=None,
        action="invitation.accepted",
        resource="invitation",
        resource_id=invite.id,
    )
    session.flush()
    return {"organization_id": invite.organization_id, "role": invite.role}


@router.get("/cost")
def cost_report(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "cost.read")
    entitlements = EntitlementService(org.plan)
    rows = session.execute(
        select(UsageRecord.metric, func.coalesce(func.sum(UsageRecord.quantity), 0))
        .where(UsageRecord.organization_id == org.id)
        .group_by(UsageRecord.metric)
    ).all()
    lines = []
    total = 0.0
    for metric, qty in rows:
        unit = entitlements.unit_cost(metric)
        amount = float(qty) * unit
        total += amount
        lines.append({
            "metric": metric,
            "quantity": float(qty),
            "unit_usd": unit,
            "amount_usd": round(amount, 6),
        })
    grouped: dict[str | None, list[dict[str, Any]]] = {}
    workspace_rows = session.execute(
        select(
            UsageRecord.workspace_id,
            UsageRecord.metric,
            func.coalesce(func.sum(UsageRecord.quantity), 0),
        )
        .where(UsageRecord.organization_id == org.id)
        .group_by(UsageRecord.workspace_id, UsageRecord.metric)
    ).all()
    for workspace_id, metric, qty in workspace_rows:
        unit = entitlements.unit_cost(metric)
        amount = float(qty) * unit
        grouped.setdefault(workspace_id, []).append({
            "metric": metric,
            "quantity": float(qty),
            "unit_usd": unit,
            "amount_usd": round(amount, 6),
        })
    workspaces = [
        {
            "workspace_id": workspace_id,
            "amount_usd": round(sum(item["amount_usd"] for item in items), 6),
            "lines": items,
        }
        for workspace_id, items in grouped.items()
    ]
    workspaces.sort(key=lambda row: row["amount_usd"], reverse=True)
    return {
        "plan": org.plan,
        "price_usd_month": entitlements._doc.get("price_usd_month", 0),
        "lines": lines,
        "workspaces": workspaces,
        "total_usd": round(total, 4),
    }


@router.post("/organizations/{organization_id}/billing/checkout")
def checkout(
    organization_id: str,
    body: CheckoutIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "billing.manage")
    if body.plan not in SELF_SERVE_PLANS:
        raise TensorlaneError(
            "INVALID_REQUEST",
            "Enterprise plans are sold by sales, not self-serve checkout.",
            400,
        )
    origin = str(request.base_url).rstrip("/")
    success = safe_return_url(
        body.success_url,
        origin=origin,
        public_url=settings.public_url,
        extra_origins=[settings.web_origin],
        default_path="/billing?status=success",
    )
    cancel = safe_return_url(
        body.cancel_url,
        origin=origin,
        public_url=settings.public_url,
        extra_origins=[settings.web_origin],
        default_path="/billing?status=cancel",
    )
    session_row = get_billing(settings).create_checkout(
        organization_id=org.id,
        plan=body.plan,
        success_url=success,
        cancel_url=cancel,
    )
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="billing.checkout",
        resource="billing",
        resource_id=session_row.id,
    )
    return {"url": session_row.url, "session_id": session_row.id, "plan": session_row.plan}


@router.post("/organizations/{organization_id}/billing/portal")
def billing_portal(
    organization_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "billing.read")
    portal = get_billing(settings).create_portal(
        customer_id=org.stripe_customer_id or f"cus_sandbox_{org.id[-8:]}",
        return_url=_dashboard_url(settings, request, "/billing"),
    )
    return {"url": portal.url}


@router.post("/organizations/{organization_id}/billing/confirm")
def confirm_sandbox_checkout(
    organization_id: str,
    body: BillingConfirmIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "billing.manage")
    if settings.stripe_configured:
        return serialize_org(org)
    if session.get(StripeEvent, body.session_id) is not None:
        return serialize_org(org)
    plan = _sandbox_plan(body.session_id, org.id)
    _apply_plan(org, plan)
    session.add(
        StripeEvent(
            id=body.session_id,
            type="sandbox.checkout.confirmed",
            payload={"organization_id": org.id, "plan": plan},
            processed_at=utcnow(),
        )
    )
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="billing.sandbox_confirmed",
        resource="billing",
        resource_id=body.session_id,
    )
    session.flush()
    return serialize_org(org)


@webhook_router.post("/api/v1/billing/webhook")
async def stripe_webhook(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
) -> dict[str, str]:
    payload = await request.body()
    provider = get_billing(settings)
    try:
        event = provider.parse_webhook(payload, stripe_signature)
    except TensorlaneError:
        raise
    except ValueError as exc:
        raise TensorlaneError("WEBHOOK_INVALID", str(exc), 400) from exc
    event_id = str(event.get("id") or "")
    event_type = str(event.get("type") or "")
    if not event_id:
        raise TensorlaneError("WEBHOOK_INVALID", "Webhook event id is required.", 400)
    if session.get(StripeEvent, event_id) is not None:
        return {"status": "duplicate"}
    data = event.get("data") or {}
    obj = data.get("object") if isinstance(data, dict) else None
    if not isinstance(obj, dict):
        obj = data if isinstance(data, dict) else {}
    metadata = obj.get("metadata") if isinstance(obj.get("metadata"), dict) else {}
    organization_id = metadata.get("organization_id") or obj.get("client_reference_id")
    plan = metadata.get("plan")
    session.add(
        StripeEvent(
            id=event_id,
            type=event_type,
            payload={"type": event_type, "organization_id": organization_id, "plan": plan},
            processed_at=utcnow(),
        )
    )
    if organization_id:
        org = session.get(Organization, organization_id)
        if org is not None:
            status = str(obj.get("status") or "").lower()
            canceled = event_type in CANCELED_SUBSCRIPTION_EVENTS or (
                event_type == "customer.subscription.updated"
                and status in CANCELED_SUBSCRIPTION_STATUSES
            )
            if canceled:
                org.plan = "free"
                org.stripe_subscription_id = None
                audit_system(
                    session,
                    organization_id=org.id,
                    action="billing.canceled",
                    resource="billing",
                    resource_id=event_id,
                    request_id_value=request_id(request),
                )
            elif (
                event_type
                in {
                    "checkout.session.completed",
                    "customer.subscription.updated",
                    "invoice.paid",
                }
                and plan in PLANS
            ):
                _apply_plan(org, plan)
                customer = obj.get("customer")
                if isinstance(customer, dict):
                    customer = customer.get("id")
                org.stripe_customer_id = customer or org.stripe_customer_id
                subscription = obj.get("subscription")
                if isinstance(subscription, dict):
                    subscription = subscription.get("id")
                if not subscription and obj.get("object") == "subscription":
                    subscription = obj.get("id")
                if subscription:
                    org.stripe_subscription_id = subscription
                audit_system(
                    session,
                    organization_id=org.id,
                    action="billing.synced",
                    resource="billing",
                    resource_id=event_id,
                    request_id_value=request_id(request),
                )
    session.flush()
    return {"status": "ok"}


@router.get("/organizations/{organization_id}/sso")
def get_sso(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "sso.manage")
    EntitlementService(org.plan).require_feature("sso")
    rows = session.scalars(
        select(SsoConnection).where(SsoConnection.organization_id == org.id)
    ).all()
    return {
        "enforced": org.sso_enforced,
        "domain": org.sso_domain,
        "connections": [
            {
                "id": row.id,
                "protocol": row.protocol,
                "issuer": row.issuer,
                "client_id": row.client_id,
                "status": row.status,
            }
            for row in rows
        ],
    }


@router.post("/organizations/{organization_id}/sso", status_code=201)
def create_sso(
    organization_id: str,
    body: SsoIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "sso.manage")
    EntitlementService(org.plan).require_feature("sso")
    if body.protocol not in SSO_PROTOCOLS:
        raise ConflictError("protocol must be oidc or saml.")
    _validate_issuer(body.issuer, settings.environment)
    existing = session.scalar(
        select(SsoConnection).where(
            SsoConnection.organization_id == org.id,
            SsoConnection.protocol == body.protocol,
        )
    )
    if existing is not None:
        raise ConflictError("A connection for this protocol already exists.")
    secret_hash = (
        hash_token(body.client_secret, settings.tensorlane_pepper) if body.client_secret else None
    )
    conn = SsoConnection(
        id=new_id(SSO_PREFIX),
        organization_id=org.id,
        protocol=body.protocol,
        issuer=body.issuer,
        client_id=body.client_id,
        client_secret_hash=secret_hash,
        status="configured",
    )
    session.add(conn)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="sso.created",
        resource="sso",
        resource_id=conn.id,
    )
    session.flush()
    return {"id": conn.id}


@router.post("/organizations/{organization_id}/scim/tokens", status_code=201)
def create_scim_token(
    organization_id: str,
    body: ScimTokenIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "scim.manage")
    EntitlementService(org.plan).require_feature("scim")
    assert principal.user_id is not None
    secret = new_scim_token()
    row = ScimToken(
        id=new_id(SCIM_PREFIX),
        organization_id=org.id,
        name=body.name,
        token_prefix=secret[:16],
        token_hash=hash_token(secret, settings.tensorlane_pepper),
        created_by=principal.user_id,
    )
    session.add(row)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="scim.token.created",
        resource="scim",
        resource_id=row.id,
    )
    session.flush()
    return {"id": row.id, "token": secret, "token_prefix": row.token_prefix}


@router.get("/organizations/{organization_id}/scim/tokens")
def list_scim_tokens(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "scim.manage")
    EntitlementService(org.plan).require_feature("scim")
    rows = session.scalars(select(ScimToken).where(ScimToken.organization_id == org.id)).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "token_prefix": row.token_prefix,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "revoked_at": row.revoked_at.isoformat() if row.revoked_at else None,
        }
        for row in rows
    ]


@router.delete("/organizations/{organization_id}/scim/tokens/{token_id}", status_code=204)
def revoke_scim_token(
    organization_id: str,
    token_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "scim.manage")
    EntitlementService(org.plan).require_feature("scim")
    row = session.get(ScimToken, token_id)
    if row is None or row.organization_id != org.id:
        raise NotFoundError("SCIM token not found.")
    row.revoked_at = utcnow()
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=None,
        action="scim.token.revoked",
        resource="scim",
        resource_id=row.id,
    )


@router.get("/organizations/{organization_id}/approvals")
def list_approvals(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "approvals.read")
    EntitlementService(org.plan).require_feature("approvals")
    rows = session.scalars(
        select(Approval)
        .where(Approval.organization_id == org.id)
        .order_by(Approval.created_at.desc())
    ).all()
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "resource_ref": row.resource_ref,
            "status": row.status,
            "note": row.note,
            "workspace_id": row.workspace_id,
            "requested_by": row.requested_by,
            "reviewed_by": row.reviewed_by,
            "created_at": row.created_at.isoformat() if row.created_at else None,
            "reviewed_at": row.reviewed_at.isoformat() if row.reviewed_at else None,
        }
        for row in rows
    ]


@router.post("/organizations/{organization_id}/approvals", status_code=201)
def create_approval(
    organization_id: str,
    body: ApprovalIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "approvals.request")
    EntitlementService(org.plan).require_feature("approvals")
    assert principal.user_id is not None
    row = Approval(
        id=new_id(APPROVAL_PREFIX),
        organization_id=org.id,
        workspace_id=body.workspace_id,
        kind=body.kind,
        resource_ref=body.resource_ref,
        note=body.note,
        requested_by=principal.user_id,
    )
    session.add(row)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=body.workspace_id,
        action="approval.created",
        resource="approval",
        resource_id=row.id,
    )
    session.flush()
    return {"id": row.id}


@router.post("/organizations/{organization_id}/approvals/{approval_id}/review")
def review_approval(
    organization_id: str,
    approval_id: str,
    body: ApprovalReviewIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "approvals.review")
    EntitlementService(org.plan).require_feature("approvals")
    row = session.get(Approval, approval_id)
    if row is None or row.organization_id != org.id:
        raise NotFoundError("Approval not found.")
    if row.status != "pending":
        raise ConflictError("This request has already been reviewed.")
    if row.requested_by == principal.user_id:
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "A second reviewer is required.",
        )
    if body.decision not in APPROVAL_DECISIONS:
        raise ConflictError("decision must be approved or rejected.")
    row.status = body.decision
    row.reviewed_by = principal.user_id
    row.reviewed_at = utcnow()
    if body.note:
        row.note = body.note
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=row.workspace_id,
        action="approval.reviewed",
        resource="approval",
        resource_id=row.id,
    )
    session.flush()
    return {"id": row.id, "status": row.status}


@router.get("/organizations/{organization_id}/alerts")
def list_alerts(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, Any]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "alerts.read")
    EntitlementService(org.plan).require_feature("quality_monitoring")
    rules = session.scalars(select(AlertRule).where(AlertRule.organization_id == org.id)).all()
    events = session.scalars(
        select(AlertEvent)
        .where(AlertEvent.organization_id == org.id)
        .order_by(AlertEvent.created_at.desc())
        .limit(50)
    ).all()
    return {
        "rules": [
            {
                "id": row.id,
                "name": row.name,
                "metric": row.metric,
                "operator": row.operator,
                "threshold": row.threshold,
                "window_hours": row.window_hours,
                "enabled": row.enabled,
                "workspace_id": row.workspace_id,
                "delivery_url": row.delivery_url,
            }
            for row in rules
        ],
        "events": [
            {
                "id": row.id,
                "rule_id": row.rule_id,
                "value": row.value,
                "message": row.message,
                "created_at": row.created_at.isoformat() if row.created_at else None,
            }
            for row in events
        ],
    }


@router.post("/organizations/{organization_id}/alerts", status_code=201)
def create_alert(
    organization_id: str,
    body: AlertIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "alerts.manage")
    EntitlementService(org.plan).require_feature("quality_monitoring")
    if body.operator not in {"gte", "lte"}:
        raise ConflictError("operator must be gte or lte.")
    delivery_url = None
    if body.delivery_url:
        delivery_url = assert_delivery_url(body.delivery_url)
    row = AlertRule(
        id=new_id(ALERT_PREFIX),
        organization_id=org.id,
        workspace_id=body.workspace_id,
        name=body.name,
        metric=body.metric,
        operator=body.operator,
        threshold=body.threshold,
        window_hours=body.window_hours,
        delivery_url=delivery_url,
    )
    session.add(row)
    enqueue(session, kind="alerts.evaluate", payload={}, organization_id=org.id)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=body.workspace_id,
        action="alert.created",
        resource="alert",
        resource_id=row.id,
    )
    session.flush()
    return {"id": row.id}


@router.get("/artifacts/download")
def download_artifact(
    organization_id: str = Query(...),
    workspace_id: str = Query(...),
    key: str = Query(...),
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> Response:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "mlflow.read")
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.organization_id != org.id or workspace.deleted_at is not None:
        raise NotFoundError("Workspace not found.")
    role = role_for(session, principal, org.id)
    if not workspace_visible(
        session,
        organization_id=org.id,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        workspace_acl=org.workspace_acl,
        role=role,
    ):
        raise NotFoundError("Workspace not found.")
    assert_artifact_prefix(org.id, workspace.id, key)
    root = workspace.artifact_root
    if root.startswith("s3://"):
        signed = presign_s3(root, key)
        if not signed:
            raise NotFoundError("Artifact not found.")
        return RedirectResponse(signed, status_code=302)
    path = resolve_local_file(root, org.id, workspace.id, key)
    return FileResponse(path, filename=path.name)


@router.delete("/organizations/{organization_id}/alerts/{alert_id}", status_code=204)
def delete_alert(
    organization_id: str,
    alert_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "alerts.manage")
    EntitlementService(org.plan).require_feature("quality_monitoring")
    row = session.get(AlertRule, alert_id)
    if row is None or row.organization_id != org.id:
        raise NotFoundError("Alert not found.")
    session.delete(row)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=row.workspace_id,
        action="alert.deleted",
        resource="alert",
        resource_id=alert_id,
    )


@router.get("/organizations/{organization_id}/views")
def list_views(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "organization.read")
    rows = session.scalars(select(SavedView).where(SavedView.organization_id == org.id)).all()
    return [
        {
            "id": row.id,
            "name": row.name,
            "surface": row.surface,
            "query": row.query,
            "workspace_id": row.workspace_id,
            "owner_user_id": row.owner_user_id,
        }
        for row in rows
    ]


@router.post("/organizations/{organization_id}/views", status_code=201)
def create_view(
    organization_id: str,
    body: SavedViewIn,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "organization.read")
    assert principal.user_id is not None
    if body.surface not in SAVED_VIEW_SURFACES:
        raise ConflictError("Unknown saved-view surface.")
    row = SavedView(
        id=new_id(VIEW_PREFIX),
        organization_id=org.id,
        workspace_id=body.workspace_id,
        owner_user_id=principal.user_id,
        name=body.name,
        surface=body.surface,
        query=body.query,
    )
    session.add(row)
    session.flush()
    return {"id": row.id}


@router.delete("/organizations/{organization_id}/views/{view_id}", status_code=204)
def delete_view(
    organization_id: str,
    view_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "organization.read")
    row = session.get(SavedView, view_id)
    if row is None or row.organization_id != org.id:
        raise NotFoundError("View not found.")
    if row.owner_user_id != principal.user_id and role_for(session, principal, org.id) not in {
        "owner",
        "admin",
    }:
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "You can only delete your own saved views.",
        )
    session.delete(row)


@router.post("/organizations/{organization_id}/workspaces/{workspace_id}/members", status_code=201)
def add_workspace_member(
    organization_id: str,
    workspace_id: str,
    body: WorkspaceMemberIn,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.invite")
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.organization_id != org.id or workspace.deleted_at is not None:
        raise NotFoundError("Workspace not found.")
    if org.workspace_acl != "restricted":
        raise TensorlaneError(
            "INVALID_REQUEST",
            "Workspace memberships apply only when workspace ACL is restricted.",
            400,
        )
    if body.role not in {"developer", "viewer", "admin", "billing"}:
        raise ConflictError("Invalid role.")
    member = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == body.user_id,
        )
    )
    if member is None:
        raise ConflictError("User must already belong to the organization.")
    existing = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == body.user_id,
        )
    )
    if existing is not None:
        existing.role = body.role
    else:
        session.add(
            WorkspaceMembership(
                id=new_id(WS_MEMBER_PREFIX),
                workspace_id=workspace_id,
                user_id=body.user_id,
                role=body.role,
            )
        )
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=workspace_id,
        action="workspace.member.added",
        resource="workspace_membership",
        resource_id=body.user_id,
    )
    session.flush()
    return {"workspace_id": workspace_id, "user_id": body.user_id, "role": body.role}


@router.get("/organizations/{organization_id}/workspaces/{workspace_id}/members")
def list_workspace_members(
    organization_id: str,
    workspace_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, str]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.read")
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.organization_id != org.id:
        raise NotFoundError("Workspace not found.")
    rows = session.scalars(
        select(WorkspaceMembership).where(WorkspaceMembership.workspace_id == workspace_id)
    ).all()
    return [{"user_id": row.user_id, "role": row.role} for row in rows]


@router.delete(
    "/organizations/{organization_id}/workspaces/{workspace_id}/members/{user_id}",
    status_code=204,
)
def remove_workspace_member(
    organization_id: str,
    workspace_id: str,
    user_id: str,
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> None:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "members.remove")
    workspace = session.get(Workspace, workspace_id)
    if workspace is None or workspace.organization_id != org.id:
        raise NotFoundError("Workspace not found.")
    row = session.scalar(
        select(WorkspaceMembership).where(
            WorkspaceMembership.workspace_id == workspace_id,
            WorkspaceMembership.user_id == user_id,
        )
    )
    if row is None:
        raise NotFoundError("Workspace membership not found.")
    session.delete(row)
    audit(
        session,
        request,
        principal=principal,
        organization_id=org.id,
        workspace_id=workspace_id,
        action="workspace.member.removed",
        resource="workspace_membership",
        resource_id=user_id,
    )


@router.post("/organizations/{organization_id}/artifacts/sign")
def sign_artifact(
    organization_id: str,
    body: ArtifactSignIn,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
) -> dict[str, str]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "mlflow.read")
    workspace = session.get(Workspace, body.workspace_id)
    if workspace is None or workspace.organization_id != org.id or workspace.deleted_at is not None:
        raise NotFoundError("Workspace not found.")
    role = role_for(session, principal, org.id)
    if not workspace_visible(
        session,
        organization_id=org.id,
        workspace_id=workspace.id,
        user_id=principal.user_id,
        workspace_acl=org.workspace_acl,
        role=role,
    ):
        raise NotFoundError("Workspace not found.")
    assert_artifact_prefix(org.id, workspace.id, body.key)
    return {"url": proxy_url(settings.public_url, org.id, workspace.id, body.key)}


@router.get("/jobs")
def list_jobs(
    organization_id: str,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
) -> list[dict[str, Any]]:
    org = _org(session, organization_id)
    require_action(session, principal, org.id, "organization.read")
    rows = session.scalars(
        select(Job).where(Job.organization_id == org.id).order_by(Job.created_at.desc()).limit(50)
    ).all()
    return [
        {
            "id": row.id,
            "kind": row.kind,
            "status": row.status,
            "attempts": row.attempts,
            "error": row.error,
            "run_after": row.run_after.isoformat() if row.run_after else None,
        }
        for row in rows
    ]


def _scim_org(session: Session, authorization: str | None, settings: Settings) -> Organization:
    if not authorization or not authorization.lower().startswith("bearer "):
        raise AuthenticationError("SCIM bearer token required.")
    token = authorization.split(" ", 1)[1].strip()
    if not token.startswith(SCIM_KEY_PREFIX):
        raise AuthenticationError("Invalid SCIM token.")
    row = session.scalar(
        select(ScimToken).where(
            ScimToken.token_hash == hash_token(token, settings.tensorlane_pepper),
            ScimToken.revoked_at.is_(None),
        )
    )
    if row is None:
        raise AuthenticationError("Invalid SCIM token.")
    org = session.get(Organization, row.organization_id)
    if org is None or org.deleted_at is not None:
        raise AuthenticationError("Invalid SCIM token.")
    EntitlementService(org.plan).require_feature("scim")
    row.last_used_at = utcnow()
    return org


def _scim_user(user: User, role: str) -> dict[str, Any]:
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:User"],
        "id": user.id,
        "userName": user.email,
        "displayName": user.name,
        "active": True,
        "emails": [{"value": user.email, "primary": True}],
        "roles": [{"value": role}],
    }


@scim_router.get("/Users")
def scim_list_users(
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
    startIndex: int = 1,
    count: int = 100,
    filter: str | None = None,
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    members = session.scalars(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == org.id)
    ).all()
    users: list[dict[str, Any]] = []
    needle = _scim_filter_needle(filter)
    for member in members:
        person = session.get(User, member.user_id)
        if person is None:
            continue
        if needle and needle not in person.email.lower() and needle not in person.name.lower():
            continue
        users.append(_scim_user(person, member.role))
    start = max(startIndex - 1, 0)
    page = users[start : start + max(count, 0)]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(users),
        "startIndex": startIndex,
        "itemsPerPage": len(page),
        "Resources": page,
    }


@scim_router.get("/Users/{user_id}")
def scim_get_user(
    user_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user_id,
        )
    )
    if membership is None:
        raise NotFoundError("User not found.")
    person = session.get(User, user_id)
    if person is None:
        raise NotFoundError("User not found.")
    return _scim_user(person, membership.role)


@scim_router.post("/Users", status_code=201)
def scim_create_user(
    body: dict[str, Any],
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    emails = body.get("emails") or []
    email = ""
    if emails and isinstance(emails[0], dict):
        email = str(emails[0].get("value") or "")
    email = (email or str(body.get("userName") or "")).lower()
    if not email or "@" not in email:
        raise TensorlaneError("INVALID_REQUEST", "userName or emails[0].value is required.", 400)
    existing_user = session.scalar(select(User).where(User.email == email))
    already_member = False
    if existing_user is not None:
        already_member = (
            session.scalar(
                select(OrganizationMembership).where(
                    OrganizationMembership.user_id == existing_user.id,
                    OrganizationMembership.organization_id == org.id,
                )
            )
            is not None
        )
    if not already_member:
        assert_seat_available(session, org, incoming=1)
    user = session.scalar(select(User).where(User.email == email))
    if user is None:
        user = User(
            id=new_id(USER_PREFIX),
            email=email,
            name=str(body.get("displayName") or email.split("@")[0]),
            email_verified=True,
        )
        session.add(user)
        session.flush()
    if (
        session.scalar(
            select(OrganizationMembership).where(
                OrganizationMembership.user_id == user.id,
                OrganizationMembership.organization_id == org.id,
            )
        )
        is None
    ):
        session.add(
            OrganizationMembership(
                id=new_id(MEMBERSHIP_PREFIX),
                user_id=user.id,
                organization_id=org.id,
                role="developer",
            )
        )
    audit_system(
        session,
        organization_id=org.id,
        action="scim.user.created",
        resource="member",
        resource_id=user.id,
        request_id_value=request_id(request),
    )
    session.flush()
    return _scim_user(user, "developer")


def _scim_membership(
    session: Session, org: Organization, user_id: str
) -> tuple[OrganizationMembership, User]:
    membership = session.scalar(
        select(OrganizationMembership).where(
            OrganizationMembership.organization_id == org.id,
            OrganizationMembership.user_id == user_id,
        )
    )
    person = session.get(User, user_id)
    if membership is None or person is None:
        raise NotFoundError("User not found.")
    return membership, person


def _scim_deprovision(session: Session, org: Organization, user_id: str, request: Request) -> User:
    membership, person = _scim_membership(session, org, user_id)
    if membership.role == "owner" and count_owners(session, org.id) <= 1:
        raise ConflictError("Organizations must keep at least one owner.")
    session.delete(membership)
    audit_system(
        session,
        organization_id=org.id,
        action="scim.user.deprovisioned",
        resource="member",
        resource_id=person.id,
        request_id_value=request_id(request),
    )
    return person


@scim_router.get("/ServiceProviderConfig")
def scim_service_provider_config(
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _scim_org(session, authorization, settings)
    return {
        "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"],
        "patch": {"supported": True},
        "bulk": {"supported": False, "maxOperations": 0, "maxPayloadSize": 0},
        "filter": {"supported": True, "maxResults": 200},
        "changePassword": {"supported": False},
        "sort": {"supported": False},
        "etag": {"supported": False},
        "authenticationSchemes": [
            {
                "type": "oauthbearertoken",
                "name": "OAuth Bearer Token",
                "description": "Authentication scheme using the OAuth Bearer Token Standard",
                "specUri": "https://www.rfc-editor.org/rfc/rfc6750",
                "documentationUri": "https://tensorlane.ai/docs/scim",
            }
        ],
    }


@scim_router.get("/ResourceTypes")
def scim_resource_types(
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    _scim_org(session, authorization, settings)
    resources = [
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            "id": "User",
            "name": "User",
            "endpoint": "/Users",
            "schema": "urn:ietf:params:scim:schemas:core:2.0:User",
        },
        {
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:ResourceType"],
            "id": "Group",
            "name": "Group",
            "endpoint": "/Groups",
            "schema": "urn:ietf:params:scim:schemas:core:2.0:Group",
        },
    ]
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(resources),
        "startIndex": 1,
        "itemsPerPage": len(resources),
        "Resources": resources,
    }


@scim_router.patch("/Users/{user_id}")
def scim_patch_user(
    user_id: str,
    body: dict[str, Any],
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    membership, person = _scim_membership(session, org, user_id)
    operations = body.get("Operations") or body.get("operations") or []
    active = True
    for operation in operations:
        if not isinstance(operation, dict):
            continue
        op = str(operation.get("op") or "").lower()
        path = str(operation.get("path") or "").lower()
        value = operation.get("value")
        if op in {"replace", "add"} and path in {"displayname", "displayName".lower()}:
            person.name = str(value or person.name)
        if op in {"replace", "add"} and (
            path == "active" or (isinstance(value, dict) and "active" in value)
        ):
            flag = value.get("active") if isinstance(value, dict) else value
            active = bool(flag)
        if op == "replace" and path == "" and isinstance(value, dict) and "active" in value:
            active = bool(value.get("active"))
    if not active:
        person = _scim_deprovision(session, org, user_id, request)
        session.flush()
        payload = _scim_user(person, membership.role)
        payload["active"] = False
        return payload
    session.flush()
    return _scim_user(person, membership.role)


@scim_router.delete("/Users/{user_id}", status_code=204)
def scim_delete_user(
    user_id: str,
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> Response:
    org = _scim_org(session, authorization, settings)
    _scim_deprovision(session, org, user_id, request)
    return Response(status_code=204)


def _scim_groups(session: Session, org: Organization) -> list[dict[str, Any]]:
    members = session.scalars(
        select(OrganizationMembership).where(OrganizationMembership.organization_id == org.id)
    ).all()
    by_role: dict[str, list[dict[str, str]]] = defaultdict(list)
    for member in members:
        person = session.get(User, member.user_id)
        if person is None:
            continue
        by_role[member.role].append({"value": person.id, "display": person.email})
    groups = []
    for role, display in SCIM_ROLE_GROUPS:
        groups.append({
            "schemas": ["urn:ietf:params:scim:schemas:core:2.0:Group"],
            "id": f"grp_{role}",
            "displayName": display,
            "members": by_role.get(role, []),
        })
    return groups


@scim_router.get("/Groups")
def scim_list_groups(
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    groups = _scim_groups(session, org)
    return {
        "schemas": ["urn:ietf:params:scim:api:messages:2.0:ListResponse"],
        "totalResults": len(groups),
        "startIndex": 1,
        "itemsPerPage": len(groups),
        "Resources": groups,
    }


@scim_router.get("/Groups/{group_id}")
def scim_get_group(
    group_id: str,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> dict[str, Any]:
    org = _scim_org(session, authorization, settings)
    for group in _scim_groups(session, org):
        if group["id"] == group_id:
            return group
    raise NotFoundError("Group not found.")
