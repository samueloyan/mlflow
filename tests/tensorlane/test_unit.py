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
