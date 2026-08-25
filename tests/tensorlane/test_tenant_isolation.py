from __future__ import annotations

from tensorlane.services import hash_api_key


def _create_key(
    client, session_token: str, organization_id: str, workspace_id: str | None, name: str
) -> dict:
    response = client.post(
        "/api/v1/api-keys",
        json={
            "name": name,
            "organization_id": organization_id,
            "workspace_id": workspace_id,
            "live": True,
        },
        headers={"Authorization": f"Bearer {session_token}"},
    )
    assert response.status_code == 201, response.text
    return response.json()


def test_api_key_secret_returned_once_and_stored_hashed(client, db, two_tenants, settings):
    acme = two_tenants["acme"]
    workspace = two_tenants["acme_ws"]
    created = _create_key(client, "alice-session", acme.id, workspace.id, "ci")
    assert created["secret"].startswith("tl_live_")
    listed = client.get(
        "/api/v1/api-keys",
        params={"organization_id": acme.id},
        headers={"Authorization": "Bearer alice-session"},
    )
    assert listed.status_code == 200
    body = listed.json()
    assert "secret" not in body[0]
    assert created["secret"] not in listed.text
    digest = hash_api_key(created["secret"], settings.tensorlane_pepper)
    from sqlalchemy import select
    from tensorlane.db.models import ApiKey

    stored = db.scalar(select(ApiKey).where(ApiKey.id == created["id"]))
    assert stored is not None
    assert stored.key_hash == digest
    assert stored.key_hash != created["secret"]


def test_org_a_cannot_read_org_b_members(client, two_tenants):
    other = two_tenants["other"]
    response = client.get(
        f"/api/v1/organizations/{other.id}/members",
        headers={"Authorization": "Bearer alice-session"},
    )
    assert response.status_code == 403
    payload = response.json()["error"]
    assert payload["code"] == "ORGANIZATION_ACCESS_DENIED"
    assert "request_id" in payload
    assert "stack" not in str(payload).lower()


def test_org_a_cannot_list_org_b_workspaces(client, two_tenants):
    other = two_tenants["other"]
    response = client.get(
        "/api/v1/workspaces",
        params={"organization_id": other.id},
        headers={"Authorization": "Bearer alice-session"},
    )
    assert response.status_code == 403


def test_org_a_api_key_cannot_create_org_b_key(client, two_tenants):
    acme = two_tenants["acme"]
    acme_ws = two_tenants["acme_ws"]
    other = two_tenants["other"]
    alice_key = _create_key(client, "alice-session", acme.id, acme_ws.id, "alice-ci")
    response = client.post(
        "/api/v1/api-keys",
        json={"name": "steal", "organization_id": other.id, "live": True},
        headers={"Authorization": f"Bearer {alice_key['secret']}"},
    )
    assert response.status_code == 403


def test_org_a_cannot_read_org_b_audit_or_usage(client, two_tenants):
    other = two_tenants["other"]
    for path in (
        f"/api/v1/audit-events?organization_id={other.id}",
        f"/api/v1/usage?organization_id={other.id}",
    ):
        response = client.get(path, headers={"Authorization": "Bearer alice-session"})
        assert response.status_code == 403, path


def test_org_a_cannot_list_org_b_api_keys(client, two_tenants):
    acme = two_tenants["acme"]
    other = two_tenants["other"]
    acme_key = _create_key(client, "alice-session", acme.id, two_tenants["acme_ws"].id, "acme-ci")
    other_key = _create_key(client, "bob-session", other.id, two_tenants["other_ws"].id, "other-ci")
    listed = client.get(
        "/api/v1/api-keys",
        params={"organization_id": acme.id},
        headers={"Authorization": "Bearer alice-session"},
    )
    assert listed.status_code == 200
    ids = {row["id"] for row in listed.json()}
    assert acme_key["id"] in ids
    assert other_key["id"] not in ids
    assert other_key["secret"] not in listed.text


def test_better_auth_iso_z_session_timestamp(client, db):
    from sqlalchemy import text
    from tensorlane.ids import SESSION_PREFIX, new_id
    from tensorlane.seed import create_user

    user = create_user(db, "iso@acme.test", "Iso")
    token = "iso-session-token"
    session_id = new_id(SESSION_PREFIX)
    db.execute(
        text(
            "INSERT INTO sessions (id, user_id, token, expires_at, created_at, updated_at) "
            "VALUES (:id, :user_id, :token, :expires_at, :created_at, :updated_at)"
        ),
        {
            "id": session_id,
            "user_id": user.id,
            "token": token,
            "expires_at": "2099-01-01T00:00:00.000Z",
            "created_at": "2026-08-25T00:00:00.000Z",
            "updated_at": "2026-08-25T00:00:00.000Z",
        },
    )
    db.commit()
    client.cookies.set("better-auth.session_token", f"{token}.sig")
    response = client.get("/api/v1/organizations")
    assert response.status_code == 200


def test_signed_session_cookie_authenticates(client, two_tenants):
    acme = two_tenants["acme"]
    client.cookies.set("better-auth.session_token", "alice-session.fakesignature")
    response = client.get(
        "/api/v1/workspaces",
        params={"organization_id": acme.id},
    )
    assert response.status_code == 200
    assert any(row["id"] == two_tenants["acme_ws"].id for row in response.json())


def test_expired_api_key_is_rejected(client, db, two_tenants, settings):
    from datetime import timedelta

    from sqlalchemy import select
    from tensorlane.clock import utcnow
    from tensorlane.db.models import ApiKey

    acme = two_tenants["acme"]
    created = _create_key(client, "alice-session", acme.id, two_tenants["acme_ws"].id, "expired")
    db.expire_all()
    stored = db.scalar(select(ApiKey).where(ApiKey.id == created["id"]))
    assert stored is not None
    stored.expires_at = utcnow() - timedelta(minutes=1)
    db.commit()
    response = client.get(
        "/api/v1/workspaces",
        params={"organization_id": acme.id},
        headers={"Authorization": f"Bearer {created['secret']}"},
    )
    assert response.status_code == 401


def test_two_orgs_can_coexist(client, two_tenants):
    acme = two_tenants["acme"]
    other = two_tenants["other"]
    acme_list = client.get(
        "/api/v1/workspaces",
        params={"organization_id": acme.id},
        headers={"Authorization": "Bearer alice-session"},
    )
    other_list = client.get(
        "/api/v1/workspaces",
        params={"organization_id": other.id},
        headers={"Authorization": "Bearer bob-session"},
    )
    assert acme_list.status_code == 200
    assert other_list.status_code == 200
    acme_ids = {row["id"] for row in acme_list.json()}
    other_ids = {row["id"] for row in other_list.json()}
    assert acme_ids.isdisjoint(other_ids)
    assert two_tenants["acme_ws"].id in acme_ids
    assert two_tenants["other_ws"].id in other_ids


def test_cannot_remove_last_owner(client, two_tenants):
    acme = two_tenants["acme"]
    alice = two_tenants["alice"]
    response = client.delete(
        f"/api/v1/organizations/{acme.id}/members/{alice.id}",
        headers={"Authorization": "Bearer alice-session"},
    )
    assert response.status_code == 409
    assert response.json()["error"]["code"] == "CONFLICT"


def test_cannot_change_member_in_another_org(client, two_tenants):
    other = two_tenants["other"]
    bob = two_tenants["bob"]
    response = client.patch(
        f"/api/v1/organizations/{other.id}/members/{bob.id}",
        json={"role": "viewer"},
        headers={"Authorization": "Bearer alice-session"},
    )
    assert response.status_code == 403


def test_workspace_scoped_key_cannot_mint_other_workspace_key(client, two_tenants):
    acme = two_tenants["acme"]
    acme_ws = two_tenants["acme_ws"]
    other_ws = client.post(
        "/api/v1/workspaces",
        json={"name": "Staging", "organization_id": acme.id},
        headers={"Authorization": "Bearer alice-session"},
    )
    assert other_ws.status_code == 201, other_ws.text
    staging_id = other_ws.json()["id"]
    scoped = _create_key(client, "alice-session", acme.id, acme_ws.id, "prod-only")
    stolen = client.post(
        "/api/v1/api-keys",
        json={
            "name": "staging-steal",
            "organization_id": acme.id,
            "workspace_id": staging_id,
            "live": True,
        },
        headers={"Authorization": f"Bearer {scoped['secret']}"},
    )
    assert stolen.status_code == 404


def test_mlflow_write_throttle_sets_retry_after(client, db, two_tenants):
    from tensorlane.db.models import UsageRecord
    from tensorlane.ids import USAGE_PREFIX, new_id

    acme = two_tenants["acme"]
    db.add(
        UsageRecord(
            id=new_id(USAGE_PREFIX),
            organization_id=acme.id,
            workspace_id=two_tenants["acme_ws"].id,
            metric="monthly_api_requests",
            quantity=200_000,
            idempotency_key="seed-throttle",
        )
    )
    db.commit()
    key = _create_key(client, "alice-session", acme.id, two_tenants["acme_ws"].id, "throttle")
    response = client.post(
        "/api/2.0/mlflow/experiments/create",
        json={"name": "fraud-detection"},
        headers={"Authorization": f"Bearer {key['secret']}"},
    )
    assert response.status_code == 429
    assert response.headers.get("retry-after") == "60"
    payload = response.json()["error"]
    assert payload["code"] == "RATE_LIMITED"
    assert "request_id" in payload
