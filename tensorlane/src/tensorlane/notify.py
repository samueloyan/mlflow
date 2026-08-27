"""HTTPS alert delivery. Reject private/loopback targets (SSRF)."""

from __future__ import annotations

import ipaddress
import logging
import socket
from urllib.parse import urlparse

import httpx

from tensorlane.errors import ConflictError

log = logging.getLogger("tensorlane.notify")

_BLOCKED_HOSTS = {"localhost", "metadata", "metadata.google.internal"}


def assert_delivery_url(url: str) -> str:
    cleaned = url.strip()
    parsed = urlparse(cleaned)
    if parsed.scheme != "https" or not parsed.hostname:
        raise ConflictError("Alert delivery URL must be https.")
    host = parsed.hostname.lower()
    if host in _BLOCKED_HOSTS or host.endswith(".internal") or host.endswith(".local"):
        raise ConflictError("Alert delivery URL is not allowed.")
    try:
        infos = socket.getaddrinfo(host, parsed.port or 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ConflictError("Alert delivery URL host could not be resolved.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise ConflictError("Alert delivery URL must not target a private address.")
    return cleaned


def deliver_webhook(url: str, payload: dict[str, object]) -> bool:
    try:
        target = assert_delivery_url(url)
    except ConflictError:
        log.warning("alert_delivery_rejected host=%s", urlparse(url).hostname)
        return False
    try:
        response = httpx.post(target, json=payload, timeout=8.0, follow_redirects=False)
    except httpx.HTTPError:
        log.exception("alert_delivery_failed host=%s", urlparse(url).hostname)
        return False
    if response.status_code >= 300:
        log.warning(
            "alert_delivery_status host=%s status=%s",
            urlparse(url).hostname,
            response.status_code,
        )
        return False
    return True
