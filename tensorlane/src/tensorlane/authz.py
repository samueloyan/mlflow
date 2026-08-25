from __future__ import annotations

from tensorlane.errors import AuthorizationError

OWNER = "owner"
ADMIN = "admin"
DEVELOPER = "developer"
VIEWER = "viewer"
BILLING = "billing"

ORG_ROLES = (OWNER, ADMIN, DEVELOPER, VIEWER, BILLING)

# Action → roles that may perform it. Keep this the only role matrix.
_MATRIX: dict[str, frozenset[str]] = {
    "organization.read": frozenset(ORG_ROLES),
    "organization.update": frozenset({OWNER, ADMIN}),
    "organization.delete": frozenset({OWNER}),
    "members.read": frozenset({OWNER, ADMIN, DEVELOPER, VIEWER}),
    "members.invite": frozenset({OWNER, ADMIN}),
    "members.remove": frozenset({OWNER, ADMIN}),
    "members.change_role": frozenset({OWNER, ADMIN}),
    "workspace.create": frozenset({OWNER, ADMIN}),
    "workspace.read": frozenset({OWNER, ADMIN, DEVELOPER, VIEWER}),
    "workspace.update": frozenset({OWNER, ADMIN}),
    "workspace.delete": frozenset({OWNER, ADMIN}),
    "api_key.create": frozenset({OWNER, ADMIN, DEVELOPER}),
    "api_key.revoke": frozenset({OWNER, ADMIN, DEVELOPER}),
    "api_key.read": frozenset({OWNER, ADMIN, DEVELOPER}),
    "mlflow.read": frozenset({OWNER, ADMIN, DEVELOPER, VIEWER}),
    "mlflow.write": frozenset({OWNER, ADMIN, DEVELOPER}),
    "usage.read": frozenset({OWNER, ADMIN, BILLING, DEVELOPER}),
    "billing.manage": frozenset({OWNER, BILLING}),
    "audit.read": frozenset({OWNER, ADMIN}),
}


def authorize(
    *,
    role: str | None,
    action: str,
    organization_id: str,
    resource_organization_id: str,
    workspace_id: str | None = None,
    resource_workspace_id: str | None = None,
) -> None:
    """Central authorization. Callers must not inline role checks."""
    if not role or role not in ORG_ROLES:
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "You do not have permission to access this organization.",
        )
    if organization_id != resource_organization_id:
        raise AuthorizationError(
            "ORGANIZATION_ACCESS_DENIED",
            "You do not have permission to access this organization.",
        )
    if (
        workspace_id is not None
        and resource_workspace_id is not None
        and workspace_id != resource_workspace_id
    ):
        raise AuthorizationError(
            "WORKSPACE_ACCESS_DENIED",
            "You do not have permission to access this workspace.",
        )
    allowed = _MATRIX.get(action)
    if allowed is None:
        raise AuthorizationError("UNKNOWN_ACTION", f"Unknown action '{action}'.")
    if role not in allowed:
        raise AuthorizationError(
            "WORKSPACE_ACCESS_DENIED"
            if "mlflow" in action or "workspace" in action
            else "ORGANIZATION_ACCESS_DENIED",
            "You do not have permission to perform this action.",
        )
