from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from tensorlane.api.app import create_app
from tensorlane.config import Settings
from tensorlane.db.session import session_factory
from tensorlane.mlflow_admin import NullMlflowAdmin
from tensorlane.seed import create_org_with_owner, create_session_token, create_user


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        database_url=f"sqlite:///{tmp_path}/tensorlane.db",
        mlflow_internal_uri="null://",
        tensorlane_pepper="test-pepper",
        artifact_root="file:///tmp/tensorlane-artifacts",
        web_origin="http://testserver",
        public_url="http://testserver",
        control_plane_rpm=0,
        mlflow_write_rpm=0,
        trace_ingest_rpm=0,
    )


@pytest.fixture
def app(settings: Settings):
    application = create_app(settings)
    application.state.mlflow_admin = NullMlflowAdmin()
    return application


@pytest.fixture
def client(app):
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def db(client):
    session = session_factory()()
    try:
        yield session
        session.commit()
    finally:
        session.close()


@pytest.fixture
def two_tenants(db):
    mlflow = NullMlflowAdmin()
    alice = create_user(db, "alice@acme.test", "Alice")
    bob = create_user(db, "bob@other.test", "Bob")
    create_session_token(db, alice, "alice-session")
    create_session_token(db, bob, "bob-session")
    acme, acme_ws = create_org_with_owner(db, alice, "Acme", mlflow=mlflow)
    other, other_ws = create_org_with_owner(db, bob, "Othercorp", mlflow=mlflow)
    db.commit()
    return {
        "alice": alice,
        "bob": bob,
        "acme": acme,
        "acme_ws": acme_ws,
        "other": other,
        "other_ws": other_ws,
        "mlflow": mlflow,
    }
