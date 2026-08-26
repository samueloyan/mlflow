from __future__ import annotations

from typing import Protocol

import httpx

from tensorlane.config import Settings
from tensorlane.mlflow_paths import mlflow_internal_url


class MlflowAdmin(Protocol):
    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None: ...

    def delete_workspace(self, name: str) -> None: ...


class HttpMlflowAdmin:
    def __init__(
        self, base_url: str, timeout: float = 15.0, static_prefix: str = "/mlflow"
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._static_prefix = static_prefix

    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None:
        response = httpx.post(
            mlflow_internal_url(self._base_url, self._static_prefix, "/api/3.0/mlflow/workspaces"),
            json={
                "name": name,
                "description": description,
                "default_artifact_root": default_artifact_root,
            },
            timeout=self._timeout,
        )
        if response.status_code in {200, 201}:
            return
        if response.status_code == 409:
            return
        raise RuntimeError(
            f"MLflow create_workspace failed: {response.status_code} {response.text}"
        )

    def delete_workspace(self, name: str) -> None:
        response = httpx.delete(
            mlflow_internal_url(
                self._base_url, self._static_prefix, f"/api/3.0/mlflow/workspaces/{name}"
            ),
            timeout=self._timeout,
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise RuntimeError(
                f"MLflow delete_workspace failed: {response.status_code} {response.text}"
            )


def admin_from_settings(settings: Settings) -> HttpMlflowAdmin | NullMlflowAdmin:
    if settings.mlflow_internal_uri.startswith("null://"):
        return NullMlflowAdmin()
    return HttpMlflowAdmin(
        settings.mlflow_internal_uri, static_prefix=settings.mlflow_static_prefix
    )


class NullMlflowAdmin:
    """Used in unit tests when the data plane is not running."""

    def __init__(self) -> None:
        self.created: list[tuple[str, str]] = []

    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None:
        self.created.append((name, default_artifact_root))

    def delete_workspace(self, name: str) -> None:
        self.created = [item for item in self.created if item[0] != name]
