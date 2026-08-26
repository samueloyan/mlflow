"""Artifact prefix checks. Sign after authz; never log URLs that embed credentials."""

from __future__ import annotations

from urllib.parse import urljoin

from tensorlane.errors import AuthorizationError


def workspace_prefix(artifact_root: str, organization_id: str, workspace_id: str) -> str:
    root = artifact_root.rstrip("/")
    expected = f"org/{organization_id}/workspace/{workspace_id}"
    if expected not in root:
        return f"{root}/{expected}"
    return root


def assert_artifact_prefix(organization_id: str, workspace_id: str, object_key: str) -> None:
    expected = f"org/{organization_id}/workspace/{workspace_id}"
    normalized = object_key.lstrip("/")
    if normalized != expected and not normalized.startswith(expected + "/"):
        raise AuthorizationError(
            "ARTIFACT_PATH_DENIED",
            "Artifact key is outside the workspace prefix.",
        )


def proxy_url(public_url: str, organization_id: str, workspace_id: str, object_key: str) -> str:
    key = object_key.lstrip("/")
    return urljoin(
        public_url.rstrip("/") + "/",
        f"api/v1/artifacts/download?organization_id={organization_id}&workspace_id={workspace_id}&key={key}",
    )
