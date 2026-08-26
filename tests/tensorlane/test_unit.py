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
