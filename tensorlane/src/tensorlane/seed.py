from __future__ import annotations

from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from tensorlane.clock import utcnow
from tensorlane.db.models import Organization, OrganizationMembership, User, Workspace
from tensorlane.db.models import Session as AuthSession
from tensorlane.ids import (
    MEMBERSHIP_PREFIX,
    ORG_PREFIX,
    SESSION_PREFIX,
    USER_PREFIX,
    WORKSPACE_PREFIX,
    new_id,
    to_mlflow_workspace_name,
)
from tensorlane.mlflow_admin import MlflowAdmin, NullMlflowAdmin


def create_user(session: Session, email: str, name: str = "User") -> User:
    user = User(
        id=new_id(USER_PREFIX),
        name=name,
        email=email.lower(),
        email_verified=True,
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(user)
    session.flush()
    return user


def create_session_token(session: Session, user: User, token: str) -> AuthSession:
    row = AuthSession(
        id=new_id(SESSION_PREFIX),
        user_id=user.id,
        token=token,
        expires_at=utcnow() + timedelta(days=7),
        created_at=utcnow(),
        updated_at=utcnow(),
    )
    session.add(row)
    session.flush()
    return row


def create_org_with_owner(
    session: Session,
    user: User,
    name: str,
    *,
    artifact_root: str = "file:///tmp/tensorlane-artifacts",
    mlflow: MlflowAdmin | None = None,
    workspace_name: str = "Production",
) -> tuple[Organization, Workspace]:
    org = Organization(
        id=new_id(ORG_PREFIX), name=name, slug=name.lower().replace(" ", "-"), plan="free"
    )
    session.add(org)
    session.add(
        OrganizationMembership(
            id=new_id(MEMBERSHIP_PREFIX),
            organization_id=org.id,
            user_id=user.id,
            role="owner",
        )
    )
    workspace_id = new_id(WORKSPACE_PREFIX)
    mlflow_name = to_mlflow_workspace_name(workspace_id)
    root = f"{artifact_root.rstrip('/')}/org/{org.id}/workspace/{workspace_id}"
    workspace = Workspace(
        id=workspace_id,
        organization_id=org.id,
        name=workspace_name,
        slug=workspace_name.lower().replace(" ", "-"),
        mlflow_workspace_name=mlflow_name,
        artifact_root=root,
    )
    session.add(workspace)
    session.flush()
    admin = mlflow or NullMlflowAdmin()
    admin.create_workspace(mlflow_name, root, workspace_name)
    return org, workspace


def sync_workspaces(session: Session, admin: MlflowAdmin) -> list[str]:
    """Create MLflow workspaces for every live Tensorlane workspace.

    Safe to run after switching ``MLFLOW_INTERNAL_URI`` from ``null://`` to a
    real tracking server. HttpMlflowAdmin treats 409 as already-created.
    """
    names: list[str] = []
    rows = session.scalars(select(Workspace).where(Workspace.deleted_at.is_(None))).all()
    for workspace in rows:
        admin.create_workspace(
            workspace.mlflow_workspace_name,
            workspace.artifact_root,
            workspace.name,
        )
        names.append(workspace.mlflow_workspace_name)
    return names


def seed_demo(
    session: Session, *, artifact_root: str, mlflow: MlflowAdmin | None = None
) -> dict[str, str]:
    """Two independent orgs for local isolation checks. Passwords are set via signup."""
    existing = session.scalar(select(User).where(User.email == "alice@acme.test"))
    if existing is not None:
        acme = session.scalar(select(Organization).where(Organization.slug == "acme"))
        other = session.scalar(select(Organization).where(Organization.slug == "othercorp"))
        bob = session.scalar(select(User).where(User.email == "bob@other.test"))
        alice_ws = (
            session.scalar(select(Workspace).where(Workspace.organization_id == acme.id))
            if acme
            else None
        )
        bob_ws = (
            session.scalar(select(Workspace).where(Workspace.organization_id == other.id))
            if other
            else None
        )
        if mlflow is not None:
            sync_workspaces(session, mlflow)
        return {
            "alice_user_id": existing.id,
            "bob_user_id": bob.id if bob else "",
            "acme_org_id": acme.id if acme else "",
            "other_org_id": other.id if other else "",
            "acme_workspace_id": alice_ws.id if alice_ws else "",
            "other_workspace_id": bob_ws.id if bob_ws else "",
            "alice_session": "alice-session",
            "bob_session": "bob-session",
        }
    alice = create_user(session, "alice@acme.test", "Alice Chen")
    bob = create_user(session, "bob@other.test", "Bob Okonkwo")
    create_session_token(session, alice, "alice-session")
    create_session_token(session, bob, "bob-session")
    acme, acme_ws = create_org_with_owner(
        session,
        alice,
        "Acme",
        artifact_root=artifact_root,
        mlflow=mlflow,
        workspace_name="Production",
    )
    other, other_ws = create_org_with_owner(
        session,
        bob,
        "Othercorp",
        artifact_root=artifact_root,
        mlflow=mlflow,
        workspace_name="Production",
    )
    session.flush()
    return {
        "alice_user_id": alice.id,
        "bob_user_id": bob.id,
        "acme_org_id": acme.id,
        "other_org_id": other.id,
        "acme_workspace_id": acme_ws.id,
        "other_workspace_id": other_ws.id,
        "alice_session": "alice-session",
        "bob_session": "bob-session",
    }
