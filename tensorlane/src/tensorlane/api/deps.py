from __future__ import annotations

from dataclasses import dataclass

from fastapi import Depends, Header, Request
from sqlalchemy import select
from sqlalchemy.orm import Session

from tensorlane.clock import utcnow
from tensorlane.config import Settings
from tensorlane.db.models import ApiKey, Organization, User, Workspace
from tensorlane.db.models import Session as AuthSession
from tensorlane.db.session import get_session
from tensorlane.errors import AuthenticationError, AuthorizationError, NotFoundError
from tensorlane.identity import session_tokens_to_try
from tensorlane.ids import is_tensorlane_api_key
from tensorlane.mlflow_admin import HttpMlflowAdmin, MlflowAdmin, NullMlflowAdmin
from tensorlane.services import api_key_role, get_membership, resolve_api_key

COOKIE_NAMES = (
    "better-auth.session_token",
    "__Secure-better-auth.session_token",
)


@dataclass
class Principal:
    user_id: str | None
    api_key: ApiKey | None
    email: str | None
    kind: str

    @property
    def actor_id(self) -> str:
        if self.api_key is not None:
            return self.api_key.id
        if self.user_id is not None:
            return self.user_id
        return "anonymous"


def settings_dep(request: Request) -> Settings:
    return request.app.state.settings


def mlflow_admin_dep(settings: Settings = Depends(settings_dep)) -> MlflowAdmin:
    # Tests override this dependency.
    if settings.mlflow_internal_uri.startswith("null://"):
        return NullMlflowAdmin()
    return HttpMlflowAdmin(settings.mlflow_internal_uri)


def _bearer_token(authorization: str | None) -> str | None:
    if not authorization:
        return None
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() != "bearer" or not token:
        return None
    return token.strip()


def get_principal(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> Principal:
    token = _bearer_token(authorization)
    if token and is_tensorlane_api_key(token):
        key = resolve_api_key(session, token, settings.tensorlane_pepper)
        return Principal(user_id=key.created_by, api_key=key, email=None, kind="api_key")

    session_token = token
    if session_token is None:
        for cookie in COOKIE_NAMES:
            if cookie in request.cookies:
                session_token = request.cookies[cookie]
                break
    if not session_token:
        raise AuthenticationError()

    now = utcnow()
    auth_session = None
    for candidate in session_tokens_to_try(session_token):
        auth_session = session.scalar(
            select(AuthSession).where(AuthSession.token == candidate, AuthSession.expires_at > now)
        )
        if auth_session is not None:
            break
    if auth_session is None:
        raise AuthenticationError("Session expired or invalid.")
    user = session.get(User, auth_session.user_id)
    if user is None:
        raise AuthenticationError()
    return Principal(user_id=user.id, api_key=None, email=user.email, kind="user")


def optional_principal(
    request: Request,
    session: Session = Depends(get_session),
    settings: Settings = Depends(settings_dep),
    authorization: str | None = Header(default=None),
) -> Principal | None:
    try:
        return get_principal(request, session, settings, authorization)
    except AuthenticationError:
        return None


@dataclass
class TenantContext:
    principal: Principal
    organization: Organization
    workspace: Workspace | None
    role: str


def resolve_tenant(
    request: Request,
    principal: Principal = Depends(get_principal),
    session: Session = Depends(get_session),
    x_tensorlane_organization_id: str | None = Header(default=None),
    x_tensorlane_workspace_id: str | None = Header(default=None),
) -> TenantContext:
    organization_id = x_tensorlane_organization_id
    workspace_id = x_tensorlane_workspace_id
    if principal.api_key is not None:
        organization_id = principal.api_key.organization_id
        if principal.api_key.workspace_id:
            workspace_id = principal.api_key.workspace_id

    if not organization_id:
        raise NotFoundError("Organization is required.")

    organization = session.get(Organization, organization_id)
    if organization is None or organization.deleted_at is not None:
        raise NotFoundError("Organization not found.")

    if principal.api_key is not None:
        if principal.api_key.organization_id != organization.id:
            raise AuthorizationError(
                "ORGANIZATION_ACCESS_DENIED",
                "You do not have permission to access this organization.",
            )
        role = api_key_role(principal.api_key)
    else:
        assert principal.user_id is not None
        membership = get_membership(session, principal.user_id, organization.id)
        role = membership.role

    workspace: Workspace | None = None
    if workspace_id:
        workspace = session.get(Workspace, workspace_id)
        if workspace is None or workspace.deleted_at is not None:
            raise NotFoundError("Workspace not found.")
        if workspace.organization_id != organization.id:
            raise NotFoundError("Workspace not found.")

    # Client-supplied MLflow workspace header is never trusted here; the gateway overwrites it.
    _ = request.headers.get("x-mlflow-workspace")

    return TenantContext(
        principal=principal,
        organization=organization,
        workspace=workspace,
        role=role,
    )
