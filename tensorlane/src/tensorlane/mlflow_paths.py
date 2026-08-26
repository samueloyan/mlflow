"""Map the public MLflow protocol onto an internal tracking server.

Since MLflow 3.12, ``mlflow server --static-prefix /mlflow`` prefixes REST and
AJAX routes as well as the UI. Tensorlane's public contract stays unprefixed
(``mlflow.set_tracking_uri`` plus ``/api/2.0`` and ``/ajax-api``) so the SDK
does not change. The gateway and admin client prepend the prefix when talking
to the data plane.

Artifact streaming (``/mlflow-artifacts``) is registered without the prefix on
the MLflow ASGI app.
"""

from __future__ import annotations

UNPREFIXED_INTERNAL_PATHS = ("/mlflow-artifacts",)


def normalize_static_prefix(static_prefix: str | None) -> str:
    if not static_prefix:
        return ""
    prefix = static_prefix.strip()
    if prefix in {"", "/"}:
        return ""
    if not prefix.startswith("/"):
        prefix = "/" + prefix
    return prefix.rstrip("/")


def mlflow_upstream_path(public_path: str, static_prefix: str | None) -> str:
    if not public_path.startswith("/"):
        public_path = "/" + public_path
    prefix = normalize_static_prefix(static_prefix)
    if not prefix:
        return public_path
    if public_path == prefix or public_path.startswith(prefix + "/"):
        return public_path
    for skip in UNPREFIXED_INTERNAL_PATHS:
        if public_path == skip or public_path.startswith(skip + "/"):
            return public_path
    return prefix + public_path


def mlflow_internal_url(origin: str, static_prefix: str | None, public_path: str) -> str:
    return origin.rstrip("/") + mlflow_upstream_path(public_path, static_prefix)
