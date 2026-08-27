"""Tensorlane tracking SDK.

User-facing code imports ``tensorlane.track``. Protocol credentials are bound
internally from ``TENSORLANE_TRACKING_URI`` and ``TENSORLANE_API_KEY``.
"""

from __future__ import annotations

import importlib
import os
import sys
from collections.abc import Iterator
from importlib.abc import Loader, MetaPathFinder
from importlib.machinery import ModuleSpec
from types import ModuleType
from typing import Any

URI_ENV = "TENSORLANE_TRACKING_URI"
API_KEY_ENV = "TENSORLANE_API_KEY"
_PROTOCOL_URI_ENV = "MLFLOW_TRACKING_URI"
_PROTOCOL_TOKEN_ENV = "MLFLOW_TRACKING_TOKEN"

_PROXY_TOP_LEVEL = frozenset({
    "ag2",
    "anthropic",
    "autogen",
    "bedrock",
    "crewai",
    "dspy",
    "gemini",
    "genai",
    "groq",
    "haystack",
    "langchain",
    "langgraph",
    "litellm",
    "llama_index",
    "mistral",
    "openai",
    "smolagents",
    "together",
})


def bind_credentials(
    tracking_uri: str | None = None,
    api_key: str | None = None,
) -> tuple[str, str | None]:
    """Map Tensorlane env/args onto the tracking protocol env the client library reads."""
    uri = tracking_uri or os.environ.get(URI_ENV) or os.environ.get(_PROTOCOL_URI_ENV)
    key = api_key or os.environ.get(API_KEY_ENV) or os.environ.get(_PROTOCOL_TOKEN_ENV)
    if not uri:
        raise RuntimeError(
            "Set TENSORLANE_TRACKING_URI or pass tracking_uri to tensorlane.track.connect()."
        )
    os.environ[URI_ENV] = uri
    os.environ[_PROTOCOL_URI_ENV] = uri
    if key:
        os.environ[API_KEY_ENV] = key
        os.environ[_PROTOCOL_TOKEN_ENV] = key
    return uri, key


def _mlflow() -> Any:
    try:
        return importlib.import_module("mlflow")
    except ImportError as exc:
        raise ImportError(
            "Tracking requires the tracking extra: pip install 'tensorlane[tracking]'"
        ) from exc


def connect(tracking_uri: str | None = None, api_key: str | None = None) -> None:
    uri, _key = bind_credentials(tracking_uri=tracking_uri, api_key=api_key)
    _install_protocol_aliases()
    _mlflow().set_tracking_uri(uri)


def _ensure_connected() -> None:
    if os.environ.get(URI_ENV) or os.environ.get(_PROTOCOL_URI_ENV):
        bind_credentials()
        _install_protocol_aliases()
        return
    raise RuntimeError(
        "Call tensorlane.track.connect() or set TENSORLANE_TRACKING_URI before tracking."
    )


def set_tracking_uri(uri: str) -> None:
    connect(tracking_uri=uri)


def set_experiment(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().set_experiment(*args, **kwargs)


def start_run(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().start_run(*args, **kwargs)


def log_param(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().log_param(*args, **kwargs)


def log_metric(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().log_metric(*args, **kwargs)


def log_params(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().log_params(*args, **kwargs)


def log_metrics(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().log_metrics(*args, **kwargs)


def end_run(*args: Any, **kwargs: Any) -> Any:
    _ensure_connected()
    return _mlflow().end_run(*args, **kwargs)


def get_tracking_uri() -> str:
    if os.environ.get(URI_ENV) or os.environ.get(_PROTOCOL_URI_ENV):
        uri, _key = bind_credentials()
        return uri
    return _mlflow().get_tracking_uri()


def __getattr__(name: str) -> Any:
    if name.startswith("_"):
        raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
    _install_protocol_aliases()
    return getattr(_mlflow(), name)


class _ProtocolLoader(Loader):
    def __init__(self, fullname: str) -> None:
        self.fullname = fullname

    def create_module(self, spec: ModuleSpec) -> ModuleType | None:
        return None

    def exec_module(self, module: ModuleType) -> None:
        suffix = module.__name__.partition("tensorlane.")[2]
        target = _mlflow()
        for part in suffix.split("."):
            target = getattr(target, part)

        def _getattr(name: str) -> Any:
            return getattr(target, name)

        module.__getattr__ = _getattr  # type: ignore[method-assign]
        module._tensorlane_protocol_target = target  # type: ignore[attr-defined]


class _ProtocolFinder(MetaPathFinder):
    def find_spec(
        self,
        fullname: str,
        path: Any | None,
        target: ModuleType | None = None,
    ) -> ModuleSpec | None:
        if not fullname.startswith("tensorlane."):
            return None
        rest = fullname[len("tensorlane.") :]
        root = rest.split(".", 1)[0]
        if root not in _PROXY_TOP_LEVEL:
            return None
        return ModuleSpec(fullname, _ProtocolLoader(fullname), is_package=True)


_installed_finder: _ProtocolFinder | None = None


def _install_protocol_aliases() -> None:
    global _installed_finder
    if _installed_finder is not None:
        return
    _installed_finder = _ProtocolFinder()
    sys.meta_path.insert(0, _installed_finder)


def iter_proxy_roots() -> Iterator[str]:
    yield from sorted(_PROXY_TOP_LEVEL)


_install_protocol_aliases()
