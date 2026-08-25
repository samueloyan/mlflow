"""Public identifiers. Never expose sequential database keys."""

from __future__ import annotations

import os
import time
import uuid

_CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"

ORG_PREFIX = "org"
WORKSPACE_PREFIX = "ws"
USER_PREFIX = "usr"
API_KEY_ID_PREFIX = "key"
REQUEST_PREFIX = "req"
AUDIT_PREFIX = "aud"
USAGE_PREFIX = "usg"
MEMBERSHIP_PREFIX = "mem"
WS_MEMBER_PREFIX = "wsm"
ACCOUNT_PREFIX = "acc"
SESSION_PREFIX = "ses"
VERIFICATION_PREFIX = "ver"

LIVE_KEY_PREFIX = "tl_live_"
TEST_KEY_PREFIX = "tl_test_"


def _encode_crockford(value: int, length: int) -> str:
    chars: list[str] = []
    for _ in range(length):
        chars.append(_CROCKFORD[value & 31])
        value >>= 5
    return "".join(reversed(chars))


def new_ulid() -> str:
    """Generate a Crockford-base32 ULID (26 characters)."""
    timestamp_ms = int(time.time() * 1000)
    entropy = int.from_bytes(os.urandom(10), "big")
    return _encode_crockford(timestamp_ms, 10) + _encode_crockford(entropy, 16)


def new_id(prefix: str) -> str:
    if not prefix or not prefix.isalpha():
        raise ValueError("prefix must be alphabetic")
    return f"{prefix}_{new_ulid().lower()}"


def to_mlflow_workspace_name(workspace_id: str) -> str:
    """Map Tensorlane workspace ids onto MLflow DNS-1123 workspace names.

    MLflow rejects underscores. Example: ``ws_01h...`` → ``ws-01h...``.
    """
    if not workspace_id.startswith(f"{WORKSPACE_PREFIX}_"):
        raise ValueError("workspace_id must use the ws_ prefix")
    name = workspace_id.replace("_", "-").lower()
    if len(name) < 2 or len(name) > 63:
        raise ValueError("encoded MLflow workspace name must be 2–63 characters")
    return name


def new_request_id() -> str:
    return new_id(REQUEST_PREFIX)


def new_api_key_secret(live: bool = True) -> str:
    prefix = LIVE_KEY_PREFIX if live else TEST_KEY_PREFIX
    return prefix + uuid.uuid4().hex + uuid.uuid4().hex[:16]


def is_tensorlane_api_key(value: str) -> bool:
    return value.startswith(LIVE_KEY_PREFIX) or value.startswith(TEST_KEY_PREFIX)
