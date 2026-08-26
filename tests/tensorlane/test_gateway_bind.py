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
from starlette.responses import JSONResponse
from starlette.routing import Route
from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.db.session import session_factory
from tensorlane.seed import create_org_with_owner, create_session_token, create_user

captured: dict[str, Any] = {}


async def experiments_create(request: Request) -> JSONResponse:
    captured["workspace"] = request.headers.get("x-mlflow-workspace")
    captured["authorization"] = request.headers.get("authorization")
    captured["cookie"] = request.headers.get("cookie")
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
            },
        )
        db.close()

    assert allowed.status_code == 200, allowed.text
    assert allowed.json()["experiment_id"] == "1"
    assert captured["workspace"] == workspace.mlflow_workspace_name
    assert captured["authorization"] is None
    assert captured["cookie"] is None


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


def test_health_and_ready(client):
    assert client.get("/health").json()["status"] == "ok"
    assert client.get("/ready").json()["status"] == "ok"
