from __future__ import annotations

import logging
from typing import Any, Protocol

import httpx

from tensorlane.config import Settings
from tensorlane.mlflow_paths import mlflow_internal_url

log = logging.getLogger("tensorlane.mlflow_admin")


class MlflowAdmin(Protocol):
    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None: ...

    def delete_workspace(self, name: str) -> None: ...

    def delete_runs_older_than(self, name: str, older_than_ms: int) -> int: ...

    def delete_traces_older_than(self, name: str, older_than_ms: int) -> int: ...


class HttpMlflowAdmin:
    def __init__(
        self, base_url: str, timeout: float = 15.0, static_prefix: str = "/mlflow"
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._timeout = timeout
        self._static_prefix = static_prefix

    def _url(self, path: str) -> str:
        return mlflow_internal_url(self._base_url, self._static_prefix, path)

    def _headers(self, workspace_name: str | None = None) -> dict[str, str]:
        if not workspace_name:
            return {}
        return {"x-mlflow-workspace": workspace_name}

    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None:
        response = httpx.post(
            self._url("/api/3.0/mlflow/workspaces"),
            json={
                "name": name,
                "description": description,
                "default_artifact_root": default_artifact_root,
            },
            timeout=self._timeout,
        )
        if response.status_code in {200, 201}:
            return
        if self._already_exists(response):
            self._ensure_artifact_root(name, default_artifact_root)
            return
        raise RuntimeError(
            f"MLflow create_workspace failed: {response.status_code} {response.text}"
        )

    def _already_exists(self, response: httpx.Response) -> bool:
        if response.status_code == 409:
            return True
        if response.status_code != 400:
            return False
        try:
            payload = response.json()
        except ValueError:
            return "RESOURCE_ALREADY_EXISTS" in (response.text or "")
        code = payload.get("error_code") if isinstance(payload, dict) else None
        return code == "RESOURCE_ALREADY_EXISTS"

    def _ensure_artifact_root(self, name: str, default_artifact_root: str) -> None:
        response = httpx.patch(
            self._url(f"/api/3.0/mlflow/workspaces/{name}"),
            json={"default_artifact_root": default_artifact_root},
            timeout=self._timeout,
        )
        if response.status_code >= 400:
            raise RuntimeError(
                f"MLflow update_workspace failed: {response.status_code} {response.text}"
            )

    def delete_workspace(self, name: str) -> None:
        response = httpx.delete(
            self._url(f"/api/3.0/mlflow/workspaces/{name}"),
            timeout=self._timeout,
        )
        if response.status_code >= 400 and response.status_code != 404:
            raise RuntimeError(
                f"MLflow delete_workspace failed: {response.status_code} {response.text}"
            )

    def _experiment_ids(self, name: str) -> list[str]:
        try:
            response = httpx.post(
                self._url("/api/2.0/mlflow/experiments/search"),
                json={"max_results": 1000},
                headers=self._headers(name),
                timeout=self._timeout,
            )
        except httpx.HTTPError:
            log.warning("mlflow_experiments_search_unreachable workspace=%s", name)
            return []
        if response.status_code >= 400:
            log.warning(
                "mlflow_experiments_search_failed workspace=%s status=%s",
                name,
                response.status_code,
            )
            return []
        payload = response.json()
        return [
            str(row["experiment_id"])
            for row in payload.get("experiments") or []
            if row.get("experiment_id")
        ]

    def delete_runs_older_than(self, name: str, older_than_ms: int) -> int:
        try:
            return self._delete_runs_older_than(name, older_than_ms)
        except httpx.HTTPError:
            log.warning("mlflow_runs_purge_unreachable workspace=%s", name)
            return 0

    def _delete_runs_older_than(self, name: str, older_than_ms: int) -> int:
        experiment_ids = self._experiment_ids(name)
        if not experiment_ids:
            return 0
        deleted = 0
        page_token: str | None = None
        for _ in range(8):
            body: dict[str, Any] = {
                "experiment_ids": experiment_ids,
                "filter": f"attributes.end_time <= {int(older_than_ms)} and attributes.status != 'RUNNING'",
                "max_results": 100,
            }
            if page_token:
                body["page_token"] = page_token
            response = httpx.post(
                self._url("/api/2.0/mlflow/runs/search"),
                json=body,
                headers=self._headers(name),
                timeout=self._timeout,
            )
            if response.status_code >= 400:
                log.warning(
                    "mlflow_runs_search_failed workspace=%s status=%s", name, response.status_code
                )
                break
            payload = response.json()
            for run in payload.get("runs") or []:
                run_id = (run.get("info") or {}).get("run_id")
                if not run_id:
                    continue
                delete = httpx.post(
                    self._url("/api/2.0/mlflow/runs/delete"),
                    json={"run_id": run_id},
                    headers=self._headers(name),
                    timeout=self._timeout,
                )
                if delete.status_code < 400:
                    deleted += 1
            page_token = payload.get("next_page_token")
            if not page_token:
                break
        return deleted

    def delete_traces_older_than(self, name: str, older_than_ms: int) -> int:
        try:
            return self._delete_traces_older_than(name, older_than_ms)
        except httpx.HTTPError:
            log.warning("mlflow_traces_purge_unreachable workspace=%s", name)
            return 0

    def _delete_traces_older_than(self, name: str, older_than_ms: int) -> int:
        experiment_ids = self._experiment_ids(name)
        if not experiment_ids:
            return 0
        deleted = 0
        for experiment_id in experiment_ids:
            response = httpx.get(
                self._url("/ajax-api/3.0/mlflow/traces"),
                params={
                    "experiment_ids": experiment_id,
                    "max_results": 100,
                },
                headers=self._headers(name),
                timeout=self._timeout,
            )
            if response.status_code >= 400:
                continue
            try:
                payload = response.json()
            except ValueError:
                continue
            traces = payload.get("traces") or payload.get("trace_infos") or []
            for trace in traces:
                info = trace.get("trace_info") or trace
                request_time = info.get("timestamp_ms") or info.get("request_time") or 0
                try:
                    stamp = int(request_time)
                except (TypeError, ValueError):
                    continue
                if stamp > older_than_ms:
                    continue
                trace_id = info.get("trace_id") or info.get("request_id")
                if not trace_id:
                    continue
                delete = httpx.delete(
                    self._url(f"/ajax-api/3.0/mlflow/traces/{trace_id}"),
                    headers=self._headers(name),
                    timeout=self._timeout,
                )
                if delete.status_code < 400 or delete.status_code == 404:
                    deleted += 1
        return deleted


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
        self.deleted_runs: list[tuple[str, int]] = []
        self.deleted_traces: list[tuple[str, int]] = []

    def create_workspace(self, name: str, default_artifact_root: str, description: str) -> None:
        self.created.append((name, default_artifact_root))

    def delete_workspace(self, name: str) -> None:
        self.created = [item for item in self.created if item[0] != name]

    def delete_runs_older_than(self, name: str, older_than_ms: int) -> int:
        self.deleted_runs.append((name, older_than_ms))
        return 0

    def delete_traces_older_than(self, name: str, older_than_ms: int) -> int:
        self.deleted_traces.append((name, older_than_ms))
        return 0
