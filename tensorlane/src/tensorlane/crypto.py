"""Invite tokens and SCIM secrets. HMAC only; secrets are shown once."""

from __future__ import annotations

import hashlib
import hmac
import secrets

from tensorlane.ids import SCIM_KEY_PREFIX


def hash_token(raw: str, pepper: str) -> str:
    return hmac.new(pepper.encode("utf-8"), raw.encode("utf-8"), hashlib.sha256).hexdigest()


def new_invite_token() -> str:
    return secrets.token_urlsafe(32)


def new_scim_token() -> str:
    return SCIM_KEY_PREFIX + secrets.token_urlsafe(24)
