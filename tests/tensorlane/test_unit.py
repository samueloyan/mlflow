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
    from tensorlane.seed import sync_workspaces, workspace_artifact_root

    ws = two_tenants["acme_ws"]
    ws.artifact_root = "file:///tmp/old/org/x/workspace/y"
    db.flush()
    admin = NullMlflowAdmin()
    sync_workspaces(db, admin, artifact_root="file:///var/mlflow/artifacts")
    db.flush()
    expected = workspace_artifact_root("file:///var/mlflow/artifacts", ws.organization_id, ws.id)
    db.refresh(ws)
    assert ws.artifact_root == expected
    assert admin.created[0][1] == expected


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
