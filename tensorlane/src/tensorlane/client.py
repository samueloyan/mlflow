"""Python client for Tensorlane native APIs. Tracking uses ``tensorlane.track``."""

from __future__ import annotations

from typing import Any

import httpx


class Tensorlane:
    def __init__(
        self, api_key: str, host: str = "https://api.tensorlane.ai", timeout: float = 30.0
    ) -> None:
        self._client = httpx.Client(
            base_url=host.rstrip("/"),
            headers={"Authorization": f"Bearer {api_key}"},
            timeout=timeout,
        )

    def close(self) -> None:
        self._client.close()

    def __enter__(self) -> Tensorlane:
        return self

    def __exit__(self, *exc: object) -> None:
        self.close()

    def _json(self, response: httpx.Response) -> Any:
        if response.status_code >= 400:
            raise RuntimeError(response.text)
        if response.status_code == 204:
            return None
        return response.json()

    def me(self) -> dict[str, Any]:
        return self._json(self._client.get("/api/v1/me"))

    def organizations(self) -> list[dict[str, Any]]:
        return self._json(self._client.get("/api/v1/organizations"))

    def workspaces(self, organization_id: str) -> list[dict[str, Any]]:
        return self._json(
            self._client.get("/api/v1/workspaces", params={"organization_id": organization_id})
        )

    def usage(self, organization_id: str) -> dict[str, Any]:
        return self._json(
            self._client.get("/api/v1/usage", params={"organization_id": organization_id})
        )

    def cost(self, organization_id: str) -> dict[str, Any]:
        return self._json(
            self._client.get("/api/v1/cost", params={"organization_id": organization_id})
        )

    def plans(self) -> dict[str, Any]:
        return self._json(self._client.get("/api/v1/plans"))

    def audit(self, organization_id: str) -> list[dict[str, Any]]:
        return self._json(
            self._client.get("/api/v1/audit-events", params={"organization_id": organization_id})
        )
