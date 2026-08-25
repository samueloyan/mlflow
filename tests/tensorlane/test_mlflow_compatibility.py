"""MLflow SDK compatibility checks.

These tests start an embedded MLflow tracking server when the `mlflow` package
is importable. They are skipped in environments that only have the control plane.
"""

from __future__ import annotations

import os

import pytest

mlflow = pytest.importorskip("mlflow")


def test_tracking_uri_contract():
    assert hasattr(mlflow, "set_tracking_uri")
    assert hasattr(mlflow, "set_experiment")
    assert hasattr(mlflow, "start_run")


@pytest.mark.skipif(
    not os.environ.get("TENSORLANE_MLFLOW_IT"), reason="Set TENSORLANE_MLFLOW_IT=1 for live SDK IT"
)
def test_sdk_against_live_gateway():
    tracking_uri = os.environ["TENSORLANE_TRACKING_URI"]
    token = os.environ["MLFLOW_TRACKING_TOKEN"]
    os.environ["MLFLOW_TRACKING_TOKEN"] = token
    mlflow.set_tracking_uri(tracking_uri)
    mlflow.set_experiment("tensorlane-compat")
    with mlflow.start_run():
        mlflow.log_metric("accuracy", 0.99)
