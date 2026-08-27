"""Map the public MLflow protocol onto an internal tracking server.

Since MLflow 3.12, ``mlflow server --static-prefix /mlflow`` prefixes REST and
AJAX routes as well as the UI. Tensorlane's public contract stays unprefixed
(``mlflow.set_tracking_uri`` plus ``/api/2.0`` and ``/ajax-api``) so the SDK
does not change. The gateway and admin client prepend the prefix when talking
to the data plane.

Artifact streaming (``/mlflow-artifacts``) is registered without the prefix on
the MLflow ASGI app. REST artifact proxy routes under ``/api/2.0/mlflow-artifacts``
stay prefixed like the rest of the tracking API so list/upload Flask handlers match.

AI Gateway invocations are public at ``/gateway/...`` (SDK and OpenAI-compatible
clients). Internally they land on the FastAPI router mounted under the static
prefix: ``/mlflow/gateway/...``.
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


_PROVIDER_GATEWAY_PREFIXES = (
    "/gateway/openai/",
    "/gateway/anthropic/",
    "/gateway/gemini/",
    "/gateway/mlflow/",
)


def tensorlane_gateway_path(path: str) -> str:
    """Map Tensorlane-public gateway URLs onto protocol paths the data plane expects.

    Dashboard snippets use ``/gateway/{endpoint}/invocations`` and
    ``/gateway/v1/chat/completions``. The tracking server still serves
    ``.../mlflow/invocations`` and ``/gateway/mlflow/v1/...``.
    """
    if not path.startswith("/"):
        path = "/" + path
    route, sep, query = path.partition("?")
    lowered = route.lower()
    if not lowered.startswith("/gateway/"):
        return path
    if any(lowered.startswith(prefix) for prefix in _PROVIDER_GATEWAY_PREFIXES):
        return path
    if "/mlflow/" in lowered:
        return path
    if lowered == "/gateway/v1" or lowered.startswith("/gateway/v1/"):
        rewritten = "/gateway/mlflow" + route[len("/gateway") :]
        return rewritten + sep + query
    if lowered.endswith("/invocations"):
        rewritten = route[: -len("/invocations")] + "/mlflow/invocations"
        return rewritten + sep + query
    return path


def mlflow_upstream_path(public_path: str, static_prefix: str | None) -> str:
    public_path = tensorlane_gateway_path(public_path)
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


def is_get_trace_artifact(path: str) -> bool:
    route = path.lower().split("?", 1)[0].rstrip("/")
    return route.endswith("/mlflow/get-trace-artifact")


_READ_RPC_MARKERS = (
    "/search",
    "/list",
    "search-datasets",
    "/batchget",
    "/get-history",
    "/get-trace-artifact",
    "/traces/get",
    "/registered-models/get",
    "/model-versions/get",
)


def is_gateway_path(path: str) -> bool:
    """True for public AI Gateway invoke/passthrough routes, not CRUD ajax-api."""
    route = path.lower().split("?", 1)[0]
    return route == "/gateway" or route.startswith("/gateway/")


def is_mlflow_write(path: str, method: str) -> bool:
    """True when the RPC mutates tracking data.

    MLflow search/list/get calls are POST in the protocol, but they are reads for
    authorization, rate limits, and usage meters.
    """
    method = method.upper()
    if method in {"GET", "HEAD", "OPTIONS"}:
        return False
    route = path.lower().split("?", 1)[0]
    return not any(marker in route for marker in _READ_RPC_MARKERS)


def is_trace_ingest(path: str, method: str) -> bool:
    """True when the request creates or appends trace data, not when it searches or reads."""
    if not is_mlflow_write(path, method):
        return False
    if method.upper() not in {"POST", "PUT", "PATCH"}:
        return False
    lowered = path.lower().split("?", 1)[0]
    if "/delete-traces" in lowered or "/traces/delete" in lowered:
        return False
    if "/v1/traces" in lowered:
        return True
    return "/mlflow/traces" in lowered


def relative_trace_artifact_path(location: str, attachment: str | None = None) -> str | None:
    """Turn a ``mlflow-artifacts:/...`` tag into the HTTP artifact path."""
    if not location:
        return None
    relative = location.strip()
    for prefix in ("mlflow-artifacts://", "mlflow-artifacts:/", "file://"):
        if relative.startswith(prefix):
            relative = relative[len(prefix) :]
            break
    else:
        if "://" in relative:
            relative = relative.split("://", 1)[-1]
    relative = relative.lstrip("/")
    if not relative:
        return None
    if attachment:
        return f"{relative.rstrip('/')}/attachments/{attachment.lstrip('/')}"
    if relative.endswith("/traces.json") or relative.endswith("traces.json"):
        return relative
    return f"{relative.rstrip('/')}/traces.json"
