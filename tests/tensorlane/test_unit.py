import pytest
from tensorlane.authz import authorize
from tensorlane.entitlements import EntitlementService
from tensorlane.errors import AuthorizationError, LimitExceededError, RateLimitedError
from tensorlane.identity import session_tokens_to_try
from tensorlane.ids import new_id, to_mlflow_workspace_name


def test_ulid_ids_are_prefixed_and_unique():
    first = new_id("org")
    second = new_id("org")
    assert first.startswith("org_")
    assert first != second
    assert first.isascii()


def test_mlflow_workspace_name_rejects_underscore():
    workspace_id = new_id("ws")
    name = to_mlflow_workspace_name(workspace_id)
    assert "_" not in name
    assert name.startswith("ws-")
    assert name == workspace_id.replace("_", "-").lower()


def test_authorize_denies_cross_organization():
    with pytest.raises(AuthorizationError, match="organization") as exc:
        authorize(
            role="owner",
            action="mlflow.read",
            organization_id="org_a",
            resource_organization_id="org_b",
        )
    assert exc.value.code == "ORGANIZATION_ACCESS_DENIED"


def test_viewer_cannot_write():
    with pytest.raises(AuthorizationError, match="permission"):
        authorize(
            role="viewer",
            action="mlflow.write",
            organization_id="org_a",
            resource_organization_id="org_a",
        )


def test_soft_trace_limit_allows_overage():
    service = EntitlementService("free")
    limit = service.get_limit("monthly_traces")
    service.enforce("monthly_traces", limit + 10, 1)


def test_hard_storage_limit_blocks():
    service = EntitlementService("free")
    with pytest.raises(LimitExceededError, match="storage_gb"):
        service.enforce("storage_gb", service.get_limit("storage_gb"), 1)


def test_api_request_throttle_returns_rate_limited():
    service = EntitlementService("free")
    with pytest.raises(RateLimitedError, match="limit") as exc:
        service.enforce("monthly_api_requests", service.get_limit("monthly_api_requests"), 1)
    assert exc.value.status_code == 429


def test_better_auth_signed_cookie_unwraps_to_raw_token():
    assert session_tokens_to_try("sesstoken.hmacvalue") == ["sesstoken.hmacvalue", "sesstoken"]
    assert session_tokens_to_try("plain") == ["plain"]


def test_list_plans_includes_self_serve_and_enterprise():
    plans = {row["id"]: row for row in EntitlementService.list_plans()}
    assert plans["free"]["price_usd_month"] == 0
    assert plans["team"]["price_usd_month"] == 99
    assert plans["enterprise"]["custom"] is True
    assert plans["free"]["features"]["sso"] is False


def test_require_feature_blocks_sso_on_free():
    with pytest.raises(AuthorizationError, match="does not include sso") as exc:
        EntitlementService("free").require_feature("sso")
    assert exc.value.code == "PLAN_FEATURE_REQUIRED"


def test_unit_cost_math():
    service = EntitlementService("team")
    assert service.unit_cost("monthly_traces") == 0.000015


def test_rate_limit_zero_is_unlimited():
    from tensorlane.ratelimit import allow

    for _ in range(50):
        allow("test-unlimited", 0)


def test_safe_return_url_rejects_open_redirect():
    from tensorlane.errors import TensorlaneError
    from tensorlane.urls import safe_return_url

    allowed = safe_return_url(
        "http://testserver/billing?status=success",
        origin="http://testserver",
        public_url="http://testserver",
        default_path="/billing?status=success",
    )
    assert allowed.startswith("http://testserver/")
    with pytest.raises(TensorlaneError, match="Return URL"):
        safe_return_url(
            "https://evil.example/phish",
            origin="http://testserver",
            public_url="http://testserver",
            default_path="/billing",
        )
    dashboard = safe_return_url(
        "http://localhost:3000/billing?status=success",
        origin="http://localhost:8080",
        public_url="http://localhost:8080",
        extra_origins=["http://localhost:3000"],
        default_path="/billing?status=success",
    )
    assert dashboard.startswith("http://localhost:3000/")
    loopback = safe_return_url(
        "http://127.0.0.1:3000/billing?status=success",
        origin="http://localhost:8080",
        public_url="http://localhost:8080",
        extra_origins=["http://localhost:3000"],
        default_path="/billing?status=success",
    )
    assert "127.0.0.1:3000" in loopback


def test_artifact_prefix_rejects_cross_workspace():
    from tensorlane.errors import AuthorizationError
    from tensorlane.storage import assert_artifact_prefix

    assert_artifact_prefix("org_a", "ws_a", "org/org_a/workspace/ws_a/run/1")
    with pytest.raises(AuthorizationError, match="outside the workspace prefix"):
        assert_artifact_prefix("org_a", "ws_a", "org/org_b/workspace/ws_b/run/1")


def test_mlflow_upstream_path_prefixes_protocol_not_artifacts():
    from tensorlane.mlflow_paths import mlflow_internal_url, mlflow_upstream_path

    assert mlflow_upstream_path("/api/2.0/mlflow/experiments/search", "/mlflow") == (
        "/mlflow/api/2.0/mlflow/experiments/search"
    )
    assert mlflow_upstream_path("/ajax-api/2.0/mlflow/runs/search", "mlflow") == (
        "/mlflow/ajax-api/2.0/mlflow/runs/search"
    )
    assert mlflow_upstream_path("/mlflow/health", "/mlflow") == "/mlflow/health"
    assert mlflow_upstream_path("/mlflow-artifacts/artifacts/foo", "/mlflow") == (
        "/mlflow-artifacts/artifacts/foo"
    )
    assert mlflow_upstream_path("/api/2.0/mlflow-artifacts/artifacts/run/model.pkl", "/mlflow") == (
        "/api/2.0/mlflow-artifacts/artifacts/run/model.pkl"
    )
    assert mlflow_upstream_path(
        "/ajax-api/2.0/mlflow-artifacts/artifacts/run/model.pkl", "/mlflow"
    ) == "/ajax-api/2.0/mlflow-artifacts/artifacts/run/model.pkl"
    assert mlflow_upstream_path("/api/2.0/mlflow/runs/create", "") == "/api/2.0/mlflow/runs/create"
    assert (
        mlflow_internal_url("http://127.0.0.1:5000", "/mlflow", "/api/3.0/mlflow/workspaces")
        == "http://127.0.0.1:5000/mlflow/api/3.0/mlflow/workspaces"
    )


def test_sync_workspaces_creates_every_live_workspace(db, two_tenants):
    from tensorlane.mlflow_admin import NullMlflowAdmin
    from tensorlane.seed import sync_workspaces

    admin = NullMlflowAdmin()
    names = sync_workspaces(db, admin)
    assert two_tenants["acme_ws"].mlflow_workspace_name in names
    assert two_tenants["other_ws"].mlflow_workspace_name in names
    assert admin.created[0][0] == names[0]


def test_sync_workspaces_rebases_artifact_root(db, two_tenants):
    from tensorlane.mlflow_admin import NullMlflowAdmin
    from tensorlane.seed import (
        mlflow_proxied_artifact_root,
        sync_workspaces,
        workspace_artifact_root,
    )

    ws = two_tenants["acme_ws"]
    ws.artifact_root = "file:///tmp/old/org/x/workspace/y"
    db.flush()
    admin = NullMlflowAdmin()
    sync_workspaces(db, admin, artifact_root="file:///var/mlflow/artifacts")
    db.flush()
    expected = workspace_artifact_root("file:///var/mlflow/artifacts", ws.organization_id, ws.id)
    db.refresh(ws)
    assert ws.artifact_root == expected
    assert "/workspaces/" in expected
    assert admin.created[0][1] == mlflow_proxied_artifact_root(ws.organization_id, ws.id)
    assert admin.created[0][1].startswith("mlflow-artifacts:/org/")


def test_mlflow_proxied_artifact_root_is_not_a_filesystem_uri():
    from tensorlane.seed import mlflow_proxied_artifact_root, workspace_artifact_root

    org_id = "org_01example"
    workspace_id = "ws_01example"
    proxied = mlflow_proxied_artifact_root(org_id, workspace_id)
    stored = workspace_artifact_root("file:///var/mlflow/artifacts", org_id, workspace_id)
    assert proxied == "mlflow-artifacts:/org/org_01example/workspace/ws_01example"
    assert stored.startswith("file:///var/mlflow/artifacts/workspaces/")
    assert "org/org_01example/workspace/ws_01example" in stored


def test_cors_allow_origins_splits_and_dedupes():
    from tensorlane.config import Settings

    settings = Settings(
        web_origin="https://tensorla.vercel.app, https://preview.example",
        public_url="https://tensorla.vercel.app/",
        cors_origins="http://localhost:3000",
    )
    assert settings.cors_allow_origins() == [
        "https://tensorla.vercel.app",
        "https://preview.example",
        "http://localhost:3000",
    ]


def test_sqlalchemy_database_url_uses_psycopg():
    from tensorlane.db.session import sqlalchemy_database_url

    assert sqlalchemy_database_url("sqlite:///./tensorlane.db") == "sqlite:///./tensorlane.db"
    assert sqlalchemy_database_url("postgresql://u:p@h/db?sslmode=require") == (
        "postgresql+psycopg://u:p@h/db?sslmode=require"
    )
    assert sqlalchemy_database_url("postgres://u:p@h/db") == "postgresql+psycopg://u:p@h/db"
    assert sqlalchemy_database_url("postgresql+psycopg2://u:p@h/db") == (
        "postgresql+psycopg2://u:p@h/db"
    )


def test_boot_sync_does_not_crash_when_mlflow_is_down(tmp_path):
    from fastapi.testclient import TestClient
    from tensorlane.api.app import create_app
    from tensorlane.config import Settings

    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/tensorlane.db",
        mlflow_internal_uri="http://127.0.0.1:9",
        tensorlane_pepper="test-pepper",
        web_origin="http://testserver",
        public_url="http://testserver",
        control_plane_rpm=0,
        mlflow_write_rpm=0,
        trace_ingest_rpm=0,
    )
    with TestClient(create_app(settings)) as client:
        assert client.get("/health").json() == {"status": "ok", "service": "tensorlane"}


def test_mailer_sends_via_smtp_when_configured(monkeypatch):
    sent: dict[str, object] = {}

    class FakeSMTP:
        def __init__(self, host, port, timeout=None):
            sent["host"] = host
            sent["port"] = port

        def __enter__(self):
            return self

        def __exit__(self, *args):
            return False

        def ehlo(self):
            return None

        def starttls(self):
            sent["tls"] = True

        def login(self, user, password):
            sent["login"] = (user, password)

        def send_message(self, message):
            sent["to"] = message["To"]
            sent["subject"] = message["Subject"]

    monkeypatch.setattr("tensorlane.mail.smtplib.SMTP", FakeSMTP)
    from tensorlane.mail import Mailer, OutboundEmail, reset_mailer

    reset_mailer()
    mailer = Mailer(
        smtp_url="smtp://user:s3cret@mail.example:587", mail_from="Tensorlane <noreply@t.test>"
    )
    mailer.send(OutboundEmail(to="a@b.test", subject="Join Acme", text="Accept: https://x"))
    assert sent["host"] == "mail.example"
    assert sent["port"] == 587
    assert sent["tls"] is True
    assert sent["login"] == ("user", "s3cret")
    assert sent["to"] == "a@b.test"
    reset_mailer()


def test_delivery_url_rejects_private_and_http(monkeypatch):
    import socket

    from tensorlane.errors import ConflictError
    from tensorlane.notify import assert_delivery_url

    with pytest.raises(ConflictError, match="https"):
        assert_delivery_url("http://example.com/hook")
    with pytest.raises(ConflictError, match="private"):
        assert_delivery_url("https://127.0.0.1/hook")

    def public_addrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 443))]

    monkeypatch.setattr("tensorlane.notify.socket.getaddrinfo", public_addrinfo)
    assert assert_delivery_url(" https://hooks.example.com/tl ") == "https://hooks.example.com/tl"

    def private_addrinfo(*_args, **_kwargs):
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.1.2.3", 443))]

    monkeypatch.setattr("tensorlane.notify.socket.getaddrinfo", private_addrinfo)
    with pytest.raises(ConflictError, match="private"):
        assert_delivery_url("https://hooks.internal.example/tl")


def test_measure_and_purge_local_artifacts(tmp_path):
    from tensorlane.storage import measure_bytes, purge_older_than, workspace_prefix

    root = tmp_path / "artifacts"
    prefix = workspace_prefix(f"file://{root}", "org_a", "ws_a")
    folder = tmp_path / "artifacts" / "org" / "org_a" / "workspace" / "ws_a"
    folder.mkdir(parents=True)
    keep = folder / "new.bin"
    keep.write_bytes(b"hello")
    stale = folder / "old.bin"
    stale.write_bytes(b"world")
    import os

    os.utime(stale, (1, 1))
    assert measure_bytes(prefix) == 10
    assert purge_older_than(prefix, 1) == 1
    assert keep.exists()
    assert not stale.exists()


def test_set_usage_upserts(db, two_tenants):
    from tensorlane.services import set_usage, usage_sum

    org_id = two_tenants["acme"].id
    set_usage(db, org_id, "storage_gb", 1.5, "storage:test")
    db.flush()
    assert usage_sum(db, org_id, "storage_gb") == 1.5
    set_usage(db, org_id, "storage_gb", 0.25, "storage:test")
    db.flush()
    assert usage_sum(db, org_id, "storage_gb") == 0.25


def test_create_workspace_treats_already_exists_and_patches_root(monkeypatch):
    from tensorlane.mlflow_admin import HttpMlflowAdmin

    calls: list[tuple[str, str, dict | None]] = []

    class _Resp:
        def __init__(self, status: int, payload: dict | None = None, text: str = ""):
            self.status_code = status
            self._payload = payload
            self.text = text

        def json(self):
            if self._payload is None:
                raise ValueError("no json")
            return self._payload

    def fake_post(url, **kwargs):
        calls.append(("POST", url, kwargs.get("json")))
        return _Resp(400, {"error_code": "RESOURCE_ALREADY_EXISTS"})

    def fake_patch(url, **kwargs):
        calls.append(("PATCH", url, kwargs.get("json")))
        return _Resp(200, {})

    monkeypatch.setattr("tensorlane.mlflow_admin.httpx.post", fake_post)
    monkeypatch.setattr("tensorlane.mlflow_admin.httpx.patch", fake_patch)
    admin = HttpMlflowAdmin("http://127.0.0.1:5000")
    admin.create_workspace("ws-abc", "file:///var/mlflow/artifacts/org/x", "Production")
    assert calls[0][0] == "POST"
    assert calls[1][0] == "PATCH"
    assert calls[1][1].endswith("/api/3.0/mlflow/workspaces/ws-abc")
    assert calls[1][2] == {"default_artifact_root": "file:///var/mlflow/artifacts/org/x"}
