from __future__ import annotations

import hashlib
import hmac
import json
import time
from pathlib import Path

from fastapi.testclient import TestClient
from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.crypto import hash_token
from tensorlane.db.models import (
    Organization,
    OrganizationMembership,
    UsageRecord,
    WorkspaceMembership,
)
from tensorlane.ids import MEMBERSHIP_PREFIX, USAGE_PREFIX, WS_MEMBER_PREFIX, new_id
from tensorlane.jobs import run_once
from tensorlane.seed import create_session_token, create_user


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def test_invite_accept_joins_org(client, db, two_tenants):
    acme = two_tenants["acme"]
    carol = create_user(db, "carol@acme.test", "Carol")
    create_session_token(db, carol, "carol-session")
    db.commit()
    created = client.post(
        f"/api/v1/organizations/{acme.id}/invitations",
        json={"email": "carol@acme.test", "role": "developer"},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201, created.text
    token = created.json()["invite_url"].rsplit("/", 1)[-1]
    preview = client.get("/api/v1/invitations/preview", params={"token": token})
    assert preview.status_code == 200
    assert preview.json()["organization_name"] == "Acme"
    wrong = client.post(
        "/api/v1/invitations/accept",
        json={"token": token},
        headers=_auth("bob-session"),
    )
    assert wrong.status_code == 403
    accepted = client.post(
        "/api/v1/invitations/accept",
        json={"token": token},
        headers=_auth("carol-session"),
    )
    assert accepted.status_code == 200, accepted.text
    members = client.get(
        f"/api/v1/organizations/{acme.id}/members",
        headers=_auth("alice-session"),
    )
    emails = {row["email"] for row in members.json()}
    assert "carol@acme.test" in emails


def test_invite_does_not_require_existing_user(client, two_tenants):
    acme = two_tenants["acme"]
    created = client.post(
        f"/api/v1/organizations/{acme.id}/invitations",
        json={"email": "newhire@acme.test", "role": "viewer"},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201, created.text
    assert "invite_url" in created.json()


def test_sandbox_checkout_and_webhook_idempotency(client, db, two_tenants):
    acme = two_tenants["acme"]
    checkout = client.post(
        f"/api/v1/organizations/{acme.id}/billing/checkout",
        json={"plan": "team", "success_url": "http://testserver/billing?status=success"},
        headers=_auth("alice-session"),
    )
    assert checkout.status_code == 200, checkout.text
    session_id = checkout.json()["session_id"]
    assert "plan=team" in checkout.json()["url"]
    confirm = client.post(
        f"/api/v1/organizations/{acme.id}/billing/confirm",
        json={"session_id": session_id},
        headers=_auth("alice-session"),
    )
    assert confirm.status_code == 200
    assert confirm.json()["plan"] == "team"

    event = {
        "id": "evt_dup_1",
        "type": "checkout.session.completed",
        "data": {
            "object": {
                "client_reference_id": acme.id,
                "metadata": {"organization_id": acme.id, "plan": "growth"},
                "customer": "cus_sandbox",
                "subscription": "sub_sandbox",
            }
        },
    }
    first = client.post("/api/v1/billing/webhook", content=json.dumps(event))
    assert first.status_code == 200
    assert first.json()["status"] == "ok"
    second = client.post("/api/v1/billing/webhook", content=json.dumps(event))
    assert second.json()["status"] == "duplicate"
    org = client.get(f"/api/v1/organizations/{acme.id}", headers=_auth("alice-session"))
    assert org.json()["plan"] == "growth"


def test_org_a_cannot_read_org_b_billing_approvals_or_alerts(client, db, two_tenants):
    other = two_tenants["other"]
    other.plan = "enterprise"
    db.commit()
    for path in (
        f"/api/v1/organizations/{other.id}/billing/checkout",
        f"/api/v1/organizations/{other.id}/approvals",
        f"/api/v1/organizations/{other.id}/alerts",
        f"/api/v1/cost?organization_id={other.id}",
    ):
        if path.endswith("/checkout"):
            response = client.post(
                path,
                json={"plan": "team"},
                headers=_auth("alice-session"),
            )
        else:
            response = client.get(path, headers=_auth("alice-session"))
        assert response.status_code == 403, path


def test_free_plan_cannot_configure_sso(client, two_tenants):
    acme = two_tenants["acme"]
    response = client.post(
        f"/api/v1/organizations/{acme.id}/sso",
        json={"protocol": "oidc", "issuer": "https://idp.example", "client_id": "abc"},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "PLAN_FEATURE_REQUIRED"


def test_scim_token_cannot_list_another_org(client, db, two_tenants):
    acme = two_tenants["acme"]
    other = two_tenants["other"]
    acme.plan = "enterprise"
    other.plan = "enterprise"
    db.commit()
    acme_token = client.post(
        f"/api/v1/organizations/{acme.id}/scim/tokens",
        json={"name": "okta"},
        headers=_auth("alice-session"),
    )
    assert acme_token.status_code == 201, acme_token.text
    listed = client.get(
        "/scim/v2/Users",
        headers={"Authorization": f"Bearer {acme_token.json()['token']}"},
    )
    assert listed.status_code == 200
    emails = {row["userName"] for row in listed.json()["Resources"]}
    assert "alice@acme.test" in emails
    assert "bob@other.test" not in emails
    other_token = client.post(
        f"/api/v1/organizations/{other.id}/scim/tokens",
        json={"name": "okta"},
        headers=_auth("bob-session"),
    )
    steal = client.get(
        "/scim/v2/Users",
        headers={"Authorization": f"Bearer {other_token.json()['token']}"},
    )
    steal_emails = {row["userName"] for row in steal.json()["Resources"]}
    assert "alice@acme.test" not in steal_emails


def test_restricted_workspace_acl_hides_ungranted_workspace(client, db, two_tenants):
    acme = two_tenants["acme"]
    prod = two_tenants["acme_ws"]
    carol = create_user(db, "dev@acme.test", "Dev")
    create_session_token(db, carol, "dev-session")
    db.add(
        OrganizationMembership(
            id=new_id(MEMBERSHIP_PREFIX),
            organization_id=acme.id,
            user_id=carol.id,
            role="developer",
        )
    )
    db.commit()
    staging = client.post(
        "/api/v1/workspaces",
        json={"name": "Staging", "organization_id": acme.id},
        headers=_auth("alice-session"),
    )
    assert staging.status_code == 201, staging.text
    db.expire_all()
    org = db.get(Organization, acme.id)
    assert org is not None
    org.workspace_acl = "restricted"
    db.add(
        WorkspaceMembership(
            id=new_id(WS_MEMBER_PREFIX),
            workspace_id=prod.id,
            user_id=carol.id,
            role="developer",
        )
    )
    db.commit()
    visible = client.get(
        "/api/v1/workspaces",
        params={"organization_id": acme.id},
        headers=_auth("dev-session"),
    )
    assert visible.status_code == 200
    ids = {row["id"] for row in visible.json()}
    assert prod.id in ids
    assert staging.json()["id"] not in ids
    owner = client.get(
        "/api/v1/workspaces",
        params={"organization_id": acme.id},
        headers=_auth("alice-session"),
    )
    owner_ids = {row["id"] for row in owner.json()}
    assert staging.json()["id"] in owner_ids


def test_cost_report_uses_unit_prices(client, db, two_tenants):
    acme = two_tenants["acme"]
    db.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=acme.id,
            workspace_id=two_tenants["acme_ws"].id,
            metric="monthly_traces",
            quantity=1000,
            idempotency_key="cost-traces",
        )
    )
    db.commit()
    response = client.get(
        "/api/v1/cost",
        params={"organization_id": acme.id},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 200
    body = response.json()
    traces = next(line for line in body["lines"] if line["metric"] == "monthly_traces")
    assert traces["amount_usd"] == 0.02


def test_approvals_isolated_and_reviewable(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "team"
    db.commit()
    created = client.post(
        f"/api/v1/organizations/{acme.id}/approvals",
        json={"kind": "prompt.promote", "resource_ref": "fraud-prompt@production"},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201, created.text
    forbidden = client.get(
        f"/api/v1/organizations/{acme.id}/approvals",
        headers=_auth("bob-session"),
    )
    assert forbidden.status_code == 403
    reviewed = client.post(
        f"/api/v1/organizations/{acme.id}/approvals/{created.json()['id']}/review",
        json={"decision": "approved", "note": "ship it"},
        headers=_auth("alice-session"),
    )
    assert reviewed.status_code == 403
    dana = create_user(db, "dana@acme.test", "Dana")
    create_session_token(db, dana, "dana-session")
    db.add(
        OrganizationMembership(
            id=new_id(MEMBERSHIP_PREFIX),
            organization_id=acme.id,
            user_id=dana.id,
            role="admin",
        )
    )
    db.commit()
    reviewed = client.post(
        f"/api/v1/organizations/{acme.id}/approvals/{created.json()['id']}/review",
        json={"decision": "approved", "note": "ship it"},
        headers=_auth("dana-session"),
    )
    assert reviewed.status_code == 200
    assert reviewed.json()["status"] == "approved"


def test_alert_worker_emits_event(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "team"
    db.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=acme.id,
            workspace_id=two_tenants["acme_ws"].id,
            metric="monthly_traces",
            quantity=90_000,
            idempotency_key="alert-traces",
        )
    )
    db.commit()
    created = client.post(
        f"/api/v1/organizations/{acme.id}/alerts",
        json={"name": "traces", "metric": "monthly_traces", "operator": "gte", "threshold": 50_000},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201, created.text
    db.expire_all()
    job = run_once(db)
    db.commit()
    assert job is not None
    listed = client.get(
        f"/api/v1/organizations/{acme.id}/alerts",
        headers=_auth("alice-session"),
    )
    assert listed.status_code == 200
    assert listed.json()["events"]


def test_invalid_stripe_signature_rejected(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/stripe.db",
        mlflow_internal_uri="null://",
        tensorlane_pepper="test-pepper",
        artifact_root="file:///tmp/tensorlane-artifacts",
        web_origin="http://testserver",
        public_url="http://testserver",
        stripe_secret_key="sk_test_x",
        stripe_webhook_secret="whsec_test",
        control_plane_rpm=0,
        mlflow_write_rpm=0,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/billing/webhook",
            content=b'{"id":"evt_x","type":"ping"}',
            headers={"Stripe-Signature": "t=1,v1=deadbeef"},
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "WEBHOOK_INVALID"


def test_valid_stripe_signature_is_accepted(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/stripe-ok.db",
        mlflow_internal_uri="null://",
        tensorlane_pepper="test-pepper",
        artifact_root="file:///tmp/tensorlane-artifacts",
        web_origin="http://testserver",
        public_url="http://testserver",
        stripe_secret_key="sk_test_x",
        stripe_webhook_secret="whsec_test",
        control_plane_rpm=0,
        mlflow_write_rpm=0,
    )
    app = create_app(settings)
    payload = json.dumps({"id": "evt_ok", "type": "ping", "data": {"object": {}}}).encode()
    timestamp = str(int(time.time()))
    digest = hmac.new(
        b"whsec_test",
        f"{timestamp}.".encode() + payload,
        hashlib.sha256,
    ).hexdigest()
    with TestClient(app) as client:
        response = client.post(
            "/api/v1/billing/webhook",
            content=payload,
            headers={"Stripe-Signature": f"t={timestamp},v1={digest}"},
        )
        assert response.status_code == 200, response.text


def test_control_plane_rate_limit(tmp_path: Path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/rl.db",
        mlflow_internal_uri="null://",
        tensorlane_pepper="test-pepper",
        artifact_root="file:///tmp/tensorlane-artifacts",
        web_origin="http://testserver",
        public_url="http://testserver",
        control_plane_rpm=3,
        mlflow_write_rpm=0,
        trace_ingest_rpm=0,
    )
    app = create_app(settings)
    with TestClient(app) as client:
        statuses = [client.get("/api/v1/plans").status_code for _ in range(5)]
        assert 429 in statuses
        limited = client.get("/api/v1/plans")
        assert limited.headers.get("retry-after") == "60"


def test_plans_are_public(client):
    response = client.get("/api/v1/plans")
    assert response.status_code == 200
    ids = {row["id"] for row in response.json()["plans"]}
    assert ids == {"free", "team", "growth", "enterprise"}


def test_enterprise_checkout_rejected(client, two_tenants):
    acme = two_tenants["acme"]
    response = client.post(
        f"/api/v1/organizations/{acme.id}/billing/checkout",
        json={"plan": "enterprise"},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 400


def test_hash_token_is_not_raw_secret():
    assert hash_token("tl_scim_secret", "pepper") != "tl_scim_secret"
    assert len(hash_token("tl_scim_secret", "pepper")) == 64


def test_invite_respects_hard_seat_limit(client, db, two_tenants):
    acme = two_tenants["acme"]
    for index in range(4):
        person = create_user(db, f"seat{index}@acme.test", f"Seat{index}")
        db.add(
            OrganizationMembership(
                id=new_id(MEMBERSHIP_PREFIX),
                organization_id=acme.id,
                user_id=person.id,
                role="developer",
            )
        )
    db.commit()
    response = client.post(
        f"/api/v1/organizations/{acme.id}/invitations",
        json={"email": "overflow@acme.test", "role": "viewer"},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 402
    assert response.json()["error"]["code"] == "LIMIT_EXCEEDED"


def test_sandbox_confirm_is_one_shot(client, db, two_tenants):
    acme = two_tenants["acme"]
    checkout = client.post(
        f"/api/v1/organizations/{acme.id}/billing/checkout",
        json={"plan": "team", "success_url": "http://testserver/billing?status=success"},
        headers=_auth("alice-session"),
    )
    session_id = checkout.json()["session_id"]
    first = client.post(
        f"/api/v1/organizations/{acme.id}/billing/confirm",
        json={"session_id": session_id},
        headers=_auth("alice-session"),
    )
    assert first.json()["plan"] == "team"
    db.expire_all()
    org = db.get(Organization, acme.id)
    assert org is not None
    org.plan = "free"
    db.commit()
    second = client.post(
        f"/api/v1/organizations/{acme.id}/billing/confirm",
        json={"session_id": session_id},
        headers=_auth("alice-session"),
    )
    assert second.json()["plan"] == "free"


def test_checkout_rejects_open_redirect(client, two_tenants):
    acme = two_tenants["acme"]
    response = client.post(
        f"/api/v1/organizations/{acme.id}/billing/checkout",
        json={"plan": "team", "success_url": "https://evil.example/phish"},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 400


def test_sso_policy_is_public_for_enforced_domain(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "enterprise"
    acme.sso_enforced = True
    acme.sso_domain = "acme.test"
    db.commit()
    required = client.get("/api/v1/auth/sso-policy", params={"email": "carol@acme.test"})
    assert required.status_code == 200
    assert required.json()["required"] is True
    other = client.get("/api/v1/auth/sso-policy", params={"email": "bob@other.test"})
    assert other.json()["required"] is False


def test_workspace_grant_requires_org_membership(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.workspace_acl = "restricted"
    db.commit()
    bob = two_tenants["bob"]
    response = client.post(
        f"/api/v1/organizations/{acme.id}/workspaces/{two_tenants['acme_ws'].id}/members",
        json={"user_id": bob.id, "role": "developer"},
        headers=_auth("alice-session"),
    )
    assert response.status_code == 409


def test_scim_deprovision_and_discovery(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "enterprise"
    db.commit()
    minted = client.post(
        f"/api/v1/organizations/{acme.id}/scim/tokens",
        json={"name": "okta"},
        headers=_auth("alice-session"),
    )
    token = minted.json()["token"]
    headers = {"Authorization": f"Bearer {token}"}
    config = client.get("/scim/v2/ServiceProviderConfig", headers=headers)
    assert config.status_code == 200
    assert config.json()["patch"]["supported"] is True
    created = client.post(
        "/scim/v2/Users",
        json={"userName": "provisioned@acme.test", "displayName": "Provisioned"},
        headers=headers,
    )
    assert created.status_code == 201, created.text
    user_id = created.json()["id"]
    patched = client.patch(
        f"/scim/v2/Users/{user_id}",
        json={"Operations": [{"op": "replace", "path": "active", "value": False}]},
        headers=headers,
    )
    assert patched.status_code == 200
    assert patched.json()["active"] is False
    listed = client.get("/scim/v2/Users", headers=headers)
    emails = {row["userName"] for row in listed.json()["Resources"]}
    assert "provisioned@acme.test" not in emails


def test_alert_evaluation_does_not_duplicate_within_window(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "team"
    db.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=acme.id,
            workspace_id=two_tenants["acme_ws"].id,
            metric="monthly_traces",
            quantity=90_000,
            idempotency_key="alert-dup-traces",
        )
    )
    db.commit()
    created = client.post(
        f"/api/v1/organizations/{acme.id}/alerts",
        json={"name": "traces", "metric": "monthly_traces", "operator": "gte", "threshold": 50_000},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201
    db.expire_all()
    first = run_once(db)
    db.commit()
    enqueue_again = client.post(
        f"/api/v1/organizations/{acme.id}/alerts",
        json={
            "name": "traces-2",
            "metric": "monthly_traces",
            "operator": "gte",
            "threshold": 50_000,
        },
        headers=_auth("alice-session"),
    )
    assert enqueue_again.status_code == 201
    db.expire_all()
    run_once(db)
    db.commit()
    listed = client.get(
        f"/api/v1/organizations/{acme.id}/alerts",
        headers=_auth("alice-session"),
    )
    events = listed.json()["events"]
    first_rule = created.json()["id"]
    assert first is not None
    assert len([row for row in events if row["rule_id"] == first_rule]) == 1


def test_invite_url_uses_dashboard_origin(client, two_tenants):
    acme = two_tenants["acme"]
    created = client.post(
        f"/api/v1/organizations/{acme.id}/invitations",
        json={"email": "invitee@acme.test", "role": "viewer"},
        headers=_auth("alice-session"),
    )
    assert created.status_code == 201, created.text
    assert created.json()["invite_url"].startswith("http://testserver/invite/")


def test_sso_requires_domain_and_is_unique(client, db, two_tenants):
    acme = two_tenants["acme"]
    other = two_tenants["other"]
    acme.plan = "enterprise"
    other.plan = "enterprise"
    db.commit()
    missing = client.patch(
        f"/api/v1/organizations/{acme.id}",
        json={"sso_enforced": True},
        headers=_auth("alice-session"),
    )
    assert missing.status_code == 409
    claimed = client.patch(
        f"/api/v1/organizations/{acme.id}",
        json={"sso_domain": "acme.test", "sso_enforced": True},
        headers=_auth("alice-session"),
    )
    assert claimed.status_code == 200, claimed.text
    clash = client.patch(
        f"/api/v1/organizations/{other.id}",
        json={"sso_domain": "acme.test"},
        headers=_auth("bob-session"),
    )
    assert clash.status_code == 409


def test_subscription_deleted_returns_org_to_free(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "team"
    acme.stripe_subscription_id = "sub_live"
    db.commit()
    event = {
        "id": "evt_sub_deleted",
        "type": "customer.subscription.deleted",
        "data": {
            "object": {
                "id": "sub_live",
                "status": "canceled",
                "metadata": {"organization_id": acme.id, "plan": "team"},
            }
        },
    }
    response = client.post("/api/v1/billing/webhook", content=json.dumps(event))
    assert response.status_code == 200
    org = client.get(f"/api/v1/organizations/{acme.id}", headers=_auth("alice-session"))
    assert org.json()["plan"] == "free"


def test_audit_csv_export_and_cost_workspaces(client, db, two_tenants):
    acme = two_tenants["acme"]
    db.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=acme.id,
            workspace_id=two_tenants["acme_ws"].id,
            metric="monthly_runs",
            quantity=2,
            idempotency_key="cost-runs",
        )
    )
    db.commit()
    csv_response = client.get(
        "/api/v1/audit-events.csv",
        params={"organization_id": acme.id},
        headers=_auth("alice-session"),
    )
    assert csv_response.status_code == 200
    assert "text/csv" in csv_response.headers["content-type"]
    assert "created_at" in csv_response.text
    cost = client.get(
        "/api/v1/cost",
        params={"organization_id": acme.id},
        headers=_auth("alice-session"),
    )
    assert cost.status_code == 200
    workspaces = cost.json()["workspaces"]
    assert any(row["workspace_id"] == two_tenants["acme_ws"].id for row in workspaces)
    forbidden = client.get(
        "/api/v1/audit-events.csv",
        params={"organization_id": acme.id},
        headers=_auth("bob-session"),
    )
    assert forbidden.status_code == 403


def test_invite_resend_rotates_token(client, two_tenants):
    acme = two_tenants["acme"]
    created = client.post(
        f"/api/v1/organizations/{acme.id}/invitations",
        json={"email": "rotate@acme.test", "role": "developer"},
        headers=_auth("alice-session"),
    )
    invite_id = created.json()["id"]
    first_token = created.json()["invite_url"].rsplit("/", 1)[-1]
    resent = client.post(
        f"/api/v1/organizations/{acme.id}/invitations/{invite_id}/resend",
        headers=_auth("alice-session"),
    )
    assert resent.status_code == 200, resent.text
    second_token = resent.json()["invite_url"].rsplit("/", 1)[-1]
    assert first_token != second_token
    stale = client.get("/api/v1/invitations/preview", params={"token": first_token})
    assert stale.status_code == 404
    fresh = client.get("/api/v1/invitations/preview", params={"token": second_token})
    assert fresh.status_code == 200


def test_scim_groups_and_cannot_remove_last_owner(client, db, two_tenants):
    acme = two_tenants["acme"]
    acme.plan = "enterprise"
    db.commit()
    minted = client.post(
        f"/api/v1/organizations/{acme.id}/scim/tokens",
        json={"name": "okta"},
        headers=_auth("alice-session"),
    )
    headers = {"Authorization": f"Bearer {minted.json()['token']}"}
    types = client.get("/scim/v2/ResourceTypes", headers=headers)
    names = {row["name"] for row in types.json()["Resources"]}
    assert names == {"User", "Group"}
    groups = client.get("/scim/v2/Groups", headers=headers)
    assert groups.status_code == 200
    owners = next(row for row in groups.json()["Resources"] if row["id"] == "grp_owner")
    assert any(member["display"] == "alice@acme.test" for member in owners["members"])
    alice_id = two_tenants["alice"].id
    deleted = client.delete(f"/scim/v2/Users/{alice_id}", headers=headers)
    assert deleted.status_code == 409
