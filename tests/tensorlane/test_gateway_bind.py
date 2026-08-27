from __future__ import annotations

import socket
import threading
import time
from typing import Any

import pytest
import uvicorn
from fastapi.testclient import TestClient
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route
from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.db.models import Workspace
from tensorlane.db.session import session_factory
from tensorlane.ids import WORKSPACE_PREFIX, new_id, to_mlflow_workspace_name
from tensorlane.seed import create_org_with_owner, create_session_token, create_user

captured: dict[str, Any] = {}


async def experiments_create(request: Request) -> JSONResponse:
    captured["workspace"] = request.headers.get("x-mlflow-workspace")
    captured["authorization"] = request.headers.get("authorization")
    captured["cookie"] = request.headers.get("cookie")
    captured["origin"] = request.headers.get("origin")
    captured["referer"] = request.headers.get("referer")
    return JSONResponse({"experiment_id": "1"})


def _free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def _wait_for_port(port: int) -> None:
    for _ in range(100):
        try:
            with socket.create_connection(("127.0.0.1", port), timeout=0.05):
                return
        except OSError:
            time.sleep(0.05)
    raise RuntimeError(f"fake MLflow did not start on {port}")


def _run_fake_mlflow(port: int) -> uvicorn.Server:
    starlette_app = Starlette(
        routes=[Route("/api/2.0/mlflow/experiments/create", experiments_create, methods=["POST"])]
    )
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    return server


@pytest.fixture
def fake_mlflow():
    captured.clear()
    port = _free_port()
    server = _run_fake_mlflow(port)
    yield f"http://127.0.0.1:{port}"
    server.should_exit = True


def test_gateway_overwrites_workspace_header_and_strips_key(fake_mlflow, tmp_path):
    settings = Settings(
        database_url=f"sqlite:///{tmp_path}/tensorlane.db",
        mlflow_internal_uri=fake_mlflow,
        mlflow_static_prefix="",
        tensorlane_pepper="test-pepper",
        artifact_root="file:///tmp/tensorlane-artifacts",
    )
    app = create_app(settings)
    with TestClient(app) as client:
        db = session_factory()()
        alice = create_user(db, "alice@acme.test", "Alice")
        create_session_token(db, alice, "alice-session")
        acme, workspace = create_org_with_owner(db, alice, "Acme")
        db.commit()
        created = client.post(
            "/api/v1/api-keys",
            json={
                "name": "ci",
                "organization_id": acme.id,
                "workspace_id": workspace.id,
                "live": True,
            },
            headers={"Authorization": "Bearer alice-session"},
        )
        assert created.status_code == 201, created.text
        secret = created.json()["secret"]

        denied = client.post(
            "/api/2.0/mlflow/experiments/create",
            json={"name": "fraud-detection"},
            headers={
                "Authorization": f"Bearer {secret}",
                "X-MLFLOW-WORKSPACE": "ws-someone-elses-workspace",
            },
        )
        assert denied.status_code == 403

        captured.clear()
        allowed = client.post(
            "/api/2.0/mlflow/experiments/create",
            json={"name": "fraud-detection"},
            headers={
                "Authorization": f"Bearer {secret}",
                "Cookie": "better-auth.session_token=should-not-leak",
                "Origin": "https://tensorla.vercel.app",
                "Referer": "https://tensorla.vercel.app/experiments",
            },
        )
        db.close()

    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["experiment_id"] == "1"
    assert captured["workspace"] == workspace.mlflow_workspace_name
    assert captured["authorization"] is None
    assert captured["cookie"] is None
    assert captured["origin"] is None
    assert captured["referer"] is None


def test_gateway_prefixes_mlflow_routes_for_static_prefix(tmp_path):
    captured.clear()
    port = _free_port()

    async def experiments_create_prefixed(request: Request) -> JSONResponse:
        captured["path"] = request.url.path
        captured["workspace"] = request.headers.get("x-mlflow-workspace")
        return JSONResponse({"experiment_id": "7"})

    starlette_app = Starlette(
        routes=[
            Route(
                "/mlflow/api/2.0/mlflow/experiments/create",
                experiments_create_prefixed,
                methods=["POST"],
            )
        ]
    )
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    try:
        settings = Settings(
            database_url=f"sqlite:///{tmp_path}/tensorlane.db",
            mlflow_internal_uri=f"http://127.0.0.1:{port}",
            mlflow_static_prefix="/mlflow",
            tensorlane_pepper="test-pepper",
            artifact_root="file:///tmp/tensorlane-artifacts",
            control_plane_rpm=0,
            mlflow_write_rpm=0,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            db = session_factory()()
            alice = create_user(db, "alice@acme.test", "Alice")
            create_session_token(db, alice, "alice-session")
            acme, workspace = create_org_with_owner(db, alice, "Acme")
            db.commit()
            created = client.post(
                "/api/v1/api-keys",
                json={
                    "name": "ci",
                    "organization_id": acme.id,
                    "workspace_id": workspace.id,
                    "live": True,
                },
                headers={"Authorization": "Bearer alice-session"},
            )
            assert created.status_code == 201, created.text
            allowed = client.post(
                "/api/2.0/mlflow/experiments/create",
                json={"name": "fraud-detection"},
                headers={"Authorization": f"Bearer {created.json()['secret']}"},
            )
            db.close()
        assert allowed.status_code == 200, allowed.text
        assert allowed.json()["experiment_id"] == "7"
        assert captured["path"] == "/mlflow/api/2.0/mlflow/experiments/create"
        assert captured["workspace"] == workspace.mlflow_workspace_name
    finally:
        server.should_exit = True


def test_session_workspace_cookie_binds_iframe_when_org_has_two_workspaces(tmp_path):
    captured.clear()
    port = _free_port()

    async def workbench(request: Request) -> HTMLResponse:
        captured["path"] = request.url.path
        captured["workspace"] = request.headers.get("x-mlflow-workspace")
        return HTMLResponse(
            "<html><head><title>MLflow</title></head><body>Welcome to MLflow</body></html>"
        )

    starlette_app = Starlette(routes=[Route("/mlflow/", workbench, methods=["GET"])])
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    try:
        settings = Settings(
            database_url=f"sqlite:///{tmp_path}/tensorlane.db",
            mlflow_internal_uri=f"http://127.0.0.1:{port}",
            mlflow_static_prefix="/mlflow",
            tensorlane_pepper="test-pepper",
            artifact_root="file:///tmp/tensorlane-artifacts",
            control_plane_rpm=0,
            mlflow_write_rpm=0,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            db = session_factory()()
            alice = create_user(db, "alice@acme.test", "Alice")
            create_session_token(db, alice, "alice-session")
            acme, production = create_org_with_owner(db, alice, "Acme")
            staging_id = new_id(WORKSPACE_PREFIX)
            db.add(
                Workspace(
                    id=staging_id,
                    organization_id=acme.id,
                    name="Staging",
                    slug="staging",
                    mlflow_workspace_name=to_mlflow_workspace_name(staging_id),
                    artifact_root=f"file:///tmp/tensorlane-artifacts/org/{acme.id}/workspace/{staging_id}",
                )
            )
            db.commit()
            missing = client.get("/mlflow/", headers={"Authorization": "Bearer alice-session"})
            assert missing.status_code == 400, missing.text
            assert missing.json()["error"]["code"] == "WORKSPACE_REQUIRED"
            client.cookies.set("tensorlane.workspace", production.id)
            allowed = client.get("/mlflow/", headers={"Authorization": "Bearer alice-session"})
            db.close()
        assert allowed.status_code == 200, allowed.text
        assert b"<title>Tensorlane</title>" in allowed.content
        assert b'data-tensorlane-rebrand="1"' in allowed.content
        assert captured["workspace"] == production.mlflow_workspace_name
    finally:
        server.should_exit = True


def test_health_and_ready(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/ready").json()["status"] == "ok"


def test_gateway_prefixes_ai_gateway_invocations(tmp_path):
    captured.clear()
    port = _free_port()

    async def invoke(request: Request) -> JSONResponse:
        captured["path"] = request.url.path
        captured["workspace"] = request.headers.get("x-mlflow-workspace")
        captured["authorization"] = request.headers.get("authorization")
        body = await request.json()
        captured["messages"] = body.get("messages")
        return JSONResponse({"choices": [{"message": {"content": "ok"}}]})

    starlette_app = Starlette(
        routes=[
            Route(
                "/mlflow/gateway/demo/mlflow/invocations",
                invoke,
                methods=["POST"],
            )
        ]
    )
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    try:
        settings = Settings(
            database_url=f"sqlite:///{tmp_path}/tensorlane.db",
            mlflow_internal_uri=f"http://127.0.0.1:{port}",
            mlflow_static_prefix="/mlflow",
            tensorlane_pepper="test-pepper",
            artifact_root="file:///tmp/tensorlane-artifacts",
            control_plane_rpm=0,
            mlflow_write_rpm=0,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            db = session_factory()()
            alice = create_user(db, "alice@acme.test", "Alice")
            create_session_token(db, alice, "alice-session")
            acme, workspace = create_org_with_owner(db, alice, "Acme")
            db.commit()
            created = client.post(
                "/api/v1/api-keys",
                json={
                    "name": "ci",
                    "organization_id": acme.id,
                    "workspace_id": workspace.id,
                    "live": True,
                },
                headers={"Authorization": "Bearer alice-session"},
            )
            assert created.status_code == 201, created.text
            invoked = client.post(
                "/gateway/demo/mlflow/invocations",
                json={"messages": [{"role": "user", "content": "hello"}]},
                headers={"Authorization": f"Bearer {created.json()['secret']}"},
            )
            db.close()
        assert invoked.status_code == 200, invoked.text
        assert invoked.json()["choices"][0]["message"]["content"] == "ok"
        assert captured["path"] == "/mlflow/gateway/demo/mlflow/invocations"
        assert captured["workspace"] == workspace.mlflow_workspace_name
        assert captured["authorization"] is None
        assert captured["messages"][0]["content"] == "hello"
    finally:
        server.should_exit = True


def test_gateway_prefixes_openai_compatible_chat(tmp_path):
    captured.clear()
    port = _free_port()

    async def invoke(request: Request) -> JSONResponse:
        captured["path"] = request.url.path
        return JSONResponse({"id": "chatcmpl-1", "choices": []})

    starlette_app = Starlette(
        routes=[
            Route(
                "/mlflow/gateway/openai/v1/chat/completions",
                invoke,
                methods=["POST"],
            )
        ]
    )
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    try:
        settings = Settings(
            database_url=f"sqlite:///{tmp_path}/tensorlane.db",
            mlflow_internal_uri=f"http://127.0.0.1:{port}",
            mlflow_static_prefix="/mlflow",
            tensorlane_pepper="test-pepper",
            artifact_root="file:///tmp/tensorlane-artifacts",
            control_plane_rpm=0,
            mlflow_write_rpm=0,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            db = session_factory()()
            alice = create_user(db, "alice@acme.test", "Alice")
            create_session_token(db, alice, "alice-session")
            acme, workspace = create_org_with_owner(db, alice, "Acme")
            db.commit()
            created = client.post(
                "/api/v1/api-keys",
                json={
                    "name": "ci",
                    "organization_id": acme.id,
                    "workspace_id": workspace.id,
                    "live": True,
                },
                headers={"Authorization": "Bearer alice-session"},
            )
            assert created.status_code == 201, created.text
            invoked = client.post(
                "/gateway/openai/v1/chat/completions",
                json={"model": "support-chat", "messages": [{"role": "user", "content": "hello"}]},
                headers={"Authorization": f"Bearer {created.json()['secret']}"},
            )
            db.close()
        assert invoked.status_code == 200, invoked.text
        assert captured["path"] == "/mlflow/gateway/openai/v1/chat/completions"
    finally:
        server.should_exit = True


def test_gateway_aliases_tensorlane_invoke_path(tmp_path):
    captured.clear()
    port = _free_port()

    async def invoke(request: Request) -> JSONResponse:
        captured["path"] = request.url.path
        return JSONResponse({"choices": [{"message": {"content": "ok"}}]})

    starlette_app = Starlette(
        routes=[
            Route(
                "/mlflow/gateway/demo/mlflow/invocations",
                invoke,
                methods=["POST"],
            )
        ]
    )
    config = uvicorn.Config(starlette_app, host="127.0.0.1", port=port, log_level="error")
    server = uvicorn.Server(config)
    thread = threading.Thread(target=server.run, daemon=True)
    thread.start()
    _wait_for_port(port)
    try:
        settings = Settings(
            database_url=f"sqlite:///{tmp_path}/tensorlane.db",
            mlflow_internal_uri=f"http://127.0.0.1:{port}",
            mlflow_static_prefix="/mlflow",
            tensorlane_pepper="test-pepper",
            artifact_root="file:///tmp/tensorlane-artifacts",
            control_plane_rpm=0,
            mlflow_write_rpm=0,
        )
        app = create_app(settings)
        with TestClient(app) as client:
            db = session_factory()()
            alice = create_user(db, "alice@acme.test", "Alice")
            create_session_token(db, alice, "alice-session")
            acme, workspace = create_org_with_owner(db, alice, "Acme")
            db.commit()
            created = client.post(
                "/api/v1/api-keys",
                json={
                    "name": "ci",
                    "organization_id": acme.id,
                    "workspace_id": workspace.id,
                    "live": True,
                },
                headers={"Authorization": "Bearer alice-session"},
            )
            assert created.status_code == 201, created.text
            invoked = client.post(
                "/gateway/demo/invocations",
                json={"messages": [{"role": "user", "content": "hello"}]},
                headers={"Authorization": f"Bearer {created.json()['secret']}"},
            )
            db.close()
        assert invoked.status_code == 200, invoked.text
        assert captured["path"] == "/mlflow/gateway/demo/mlflow/invocations"
    finally:
        server.should_exit = True
