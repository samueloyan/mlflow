"""Return-URL allowlist. Checkout and portal must not become an open redirect."""

from __future__ import annotations

from urllib.parse import urlparse

from tensorlane.errors import TensorlaneError


def _expand_host(netloc: str) -> set[str]:
    host = netloc.lower()
    aliases = {host}
    if host.startswith("localhost"):
        aliases.add("127.0.0.1" + host[len("localhost") :])
    if host.startswith("127.0.0.1"):
        aliases.add("localhost" + host[len("127.0.0.1") :])
    return aliases


def safe_return_url(
    candidate: str | None,
    *,
    origin: str,
    public_url: str,
    default_path: str,
    extra_origins: list[str] | None = None,
) -> str:
    fallback = f"{origin.rstrip('/')}{default_path}"
    if not candidate:
        return fallback
    parsed = urlparse(candidate)
    allowed: set[str] = set()
    for raw in [origin, public_url, *(extra_origins or [])]:
        host = urlparse(raw).netloc
        if host:
            allowed.update(_expand_host(host))
    if (
        parsed.scheme in {"http", "https"}
        and parsed.netloc.lower() in allowed
        and parsed.path.startswith("/")
        and not parsed.path.startswith("//")
    ):
        return candidate
    raise TensorlaneError(
        "INVALID_REQUEST",
        "Return URL must stay on this Tensorlane host.",
        400,
    )
