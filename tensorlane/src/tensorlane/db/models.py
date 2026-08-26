from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    String,
    Text,
    TypeDecorator,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class IsoDateTime(TypeDecorator):
    """SQLite + Better Auth store ISO-8601 timestamps, often with a trailing Z."""

    impl = DateTime
    cache_ok = True

    def process_bind_param(self, value: datetime | None, dialect) -> datetime | None:
        if value is None:
            return None
        if value.tzinfo is not None:
            return value.astimezone(timezone.utc).replace(tzinfo=None)
        return value

    def result_processor(self, dialect, coltype):
        def process(value: Any) -> datetime | None:
            if value is None:
                return None
            if isinstance(value, str):
                parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            else:
                parsed = value
            if getattr(parsed, "tzinfo", None) is not None:
                return parsed.astimezone(timezone.utc).replace(tzinfo=None)
            return parsed

        return process


class Base(DeclarativeBase):
    pass


class User(Base):
    """Better Auth user row (snake_case field mapping)."""

    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False, default="")
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    email_verified: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    image: Mapped[str | None] = mapped_column(String(1024), nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        IsoDateTime(), server_default=func.now(), onupdate=func.now()
    )

    memberships: Mapped[list[OrganizationMembership]] = relationship(back_populates="user")


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token: Mapped[str] = mapped_column(String(255), unique=True, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(IsoDateTime(), nullable=False)
    ip_address: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())

    user: Mapped[User] = relationship()


class Account(Base):
    """Better Auth account row. Unique on (provider_id, account_id)."""

    __tablename__ = "accounts"
    __table_args__ = (
        UniqueConstraint("provider_id", "account_id", name="uq_accounts_provider_account"),
    )

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    account_id: Mapped[str] = mapped_column(String(256), nullable=False)
    provider_id: Mapped[str] = mapped_column(String(64), nullable=False)
    access_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    refresh_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    access_token_expires_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    refresh_token_expires_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)
    id_token: Mapped[str | None] = mapped_column(Text, nullable=True)
    password: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class Verification(Base):
    __tablename__ = "verifications"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    identifier: Mapped[str] = mapped_column(String(320), index=True, nullable=False)
    value: Mapped[str] = mapped_column(Text, nullable=False)
    expires_at: Mapped[datetime] = mapped_column(IsoDateTime(), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class Organization(Base):
    __tablename__ = "organizations"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    plan: Mapped[str] = mapped_column(String(32), nullable=False, default="free")
    stripe_customer_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    stripe_subscription_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    billing_email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    isolation_mode: Mapped[str] = mapped_column(String(32), nullable=False, default="shared")
    workspace_acl: Mapped[str] = mapped_column(String(32), nullable=False, default="org_wide")
    sso_enforced: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    sso_domain: Mapped[str | None] = mapped_column(String(255), nullable=True)
    retention_traces_days: Mapped[int] = mapped_column(nullable=False, default=90)
    retention_runs_days: Mapped[int] = mapped_column(nullable=False, default=365)
    retention_artifacts_days: Mapped[int] = mapped_column(nullable=False, default=365)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)

    memberships: Mapped[list[OrganizationMembership]] = relationship(back_populates="organization")
    workspaces: Mapped[list[Workspace]] = relationship(back_populates="organization")


class OrganizationMembership(Base):
    __tablename__ = "organization_memberships"
    __table_args__ = (
        UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),
    )

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())

    organization: Mapped[Organization] = relationship(back_populates="memberships")
    user: Mapped[User] = relationship(back_populates="memberships")


class Workspace(Base):
    __tablename__ = "workspaces"
    __table_args__ = (UniqueConstraint("organization_id", "slug", name="uq_workspace_org_slug"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    slug: Mapped[str] = mapped_column(String(64), nullable=False)
    mlflow_workspace_name: Mapped[str] = mapped_column(String(63), unique=True, nullable=False)
    artifact_root: Mapped[str] = mapped_column(String(1024), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    deleted_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)

    organization: Mapped[Organization] = relationship(back_populates="workspaces")


class WorkspaceMembership(Base):
    """Reserved for Phase 4 per-workspace grants. Phase 1: unused (org-wide access)."""

    __tablename__ = "workspace_memberships"
    __table_args__ = (UniqueConstraint("workspace_id", "user_id", name="uq_workspace_member"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    workspace_id: Mapped[str] = mapped_column(
        ForeignKey("workspaces.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False, default="developer")
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str | None] = mapped_column(
        ForeignKey("workspaces.id", ondelete="SET NULL"), nullable=True, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    key_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    key_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    expires_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    permissions: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)


class AuditEvent(Base):
    __tablename__ = "audit_events"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    actor_user_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    actor_key_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    organization_id: Mapped[str | None] = mapped_column(String(48), index=True, nullable=True)
    workspace_id: Mapped[str | None] = mapped_column(String(48), index=True, nullable=True)
    action: Mapped[str] = mapped_column(String(64), nullable=False)
    resource: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    user_agent: Mapped[str | None] = mapped_column(String(512), nullable=True)
    result: Mapped[str] = mapped_column(String(32), nullable=False, default="success")
    extra: Mapped[dict[str, Any]] = mapped_column("metadata", JSON, default=dict)
    request_id: Mapped[str] = mapped_column(String(48), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class UsageRecord(Base):
    __tablename__ = "usage_records"
    __table_args__ = (UniqueConstraint("idempotency_key", name="uq_usage_idempotency"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    workspace_id: Mapped[str | None] = mapped_column(String(48), index=True, nullable=True)
    metric: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    quantity: Mapped[float] = mapped_column(Float, nullable=False)
    idempotency_key: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class Invitation(Base):
    __tablename__ = "invitations"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    email: Mapped[str] = mapped_column(String(320), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    invited_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    expires_at: Mapped[datetime] = mapped_column(IsoDateTime(), nullable=False)
    accepted_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    revoked_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class SsoConnection(Base):
    __tablename__ = "sso_connections"
    __table_args__ = (UniqueConstraint("organization_id", "protocol", name="uq_sso_org_protocol"),)

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    protocol: Mapped[str] = mapped_column(String(16), nullable=False)
    issuer: Mapped[str] = mapped_column(String(512), nullable=False)
    client_id: Mapped[str] = mapped_column(String(256), nullable=False)
    client_secret_hash: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="configured")
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class ScimToken(Base):
    __tablename__ = "scim_tokens"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    token_prefix: Mapped[str] = mapped_column(String(24), nullable=False)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    revoked_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    last_used_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)


class Job(Base):
    __tablename__ = "jobs"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str | None] = mapped_column(String(48), index=True, nullable=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="queued", index=True)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    attempts: Mapped[int] = mapped_column(nullable=False, default=0)
    run_after: Mapped[datetime] = mapped_column(IsoDateTime(), nullable=False)
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)


class StripeEvent(Base):
    __tablename__ = "stripe_events"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    type: Mapped[str] = mapped_column(String(128), nullable=False)
    payload: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    processed_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class Approval(Base):
    __tablename__ = "approvals"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str | None] = mapped_column(String(48), nullable=True, index=True)
    kind: Mapped[str] = mapped_column(String(64), nullable=False)
    resource_ref: Mapped[str] = mapped_column(String(256), nullable=False)
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="pending", index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False, default="")
    requested_by: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    reviewed_by: Mapped[str | None] = mapped_column(String(48), nullable=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
    reviewed_at: Mapped[datetime | None] = mapped_column(IsoDateTime(), nullable=True)


class AlertRule(Base):
    __tablename__ = "alert_rules"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    metric: Mapped[str] = mapped_column(String(64), nullable=False)
    operator: Mapped[str] = mapped_column(String(8), nullable=False, default="gte")
    threshold: Mapped[float] = mapped_column(Float, nullable=False)
    window_hours: Mapped[int] = mapped_column(nullable=False, default=24)
    enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class AlertEvent(Base):
    __tablename__ = "alert_events"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    rule_id: Mapped[str] = mapped_column(
        ForeignKey("alert_rules.id", ondelete="CASCADE"), index=True
    )
    organization_id: Mapped[str] = mapped_column(String(48), index=True, nullable=False)
    value: Mapped[float] = mapped_column(Float, nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())


class SavedView(Base):
    __tablename__ = "saved_views"

    id: Mapped[str] = mapped_column(String(48), primary_key=True)
    organization_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), index=True
    )
    workspace_id: Mapped[str | None] = mapped_column(String(48), nullable=True)
    owner_user_id: Mapped[str] = mapped_column(ForeignKey("users.id"), nullable=False)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    surface: Mapped[str] = mapped_column(String(32), nullable=False)
    query: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(IsoDateTime(), server_default=func.now())
