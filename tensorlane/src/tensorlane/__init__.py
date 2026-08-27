"""Tensorlane control plane, gateway, and tracking SDK."""

from __future__ import annotations

import importlib
from typing import Any

__version__ = "0.1.0"

_TRACK_EXPORTS = frozenset({
    "connect",
    "end_run",
    "get_tracking_uri",
    "log_metric",
    "log_metrics",
    "log_param",
    "log_params",
    "set_experiment",
    "set_tracking_uri",
    "start_run",
})

__all__ = ["__version__", *_TRACK_EXPORTS]


def __getattr__(name: str) -> Any:
    if name == "track":
        return importlib.import_module("tensorlane.track")
    track_module = importlib.import_module("tensorlane.track")
    if name in _TRACK_EXPORTS:
        return getattr(track_module, name)
    if name in track_module.iter_proxy_roots():
        return getattr(track_module, name)
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")
