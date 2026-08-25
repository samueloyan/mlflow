"""Identity boundary.

Better Auth owns password hashing and session rows. Tensorlane owns
organizations, membership, and API keys. Do not enable Better Auth's
organization plugin.
"""

from __future__ import annotations

from typing import Protocol
from urllib.parse import unquote


class IdentityProvider(Protocol):
    """Stable port for human identity. Phase 4 may wrap SSO behind this."""

    def session_tokens_to_try(self, raw: str) -> list[str]: ...


def session_tokens_to_try(raw: str) -> list[str]:
    """Candidates for a Better Auth session cookie or Bearer token.

    Better Auth signs cookies as ``{token}.{hmac}``. The ``sessions.token``
    column stores the unsigned token. We try both the raw value and the
    prefix before the last dot.
    """
    value = unquote((raw or "").strip())
    if not value:
        return []
    tokens = [value]
    if "." in value:
        tokens.append(value.rsplit(".", 1)[0])
    seen: set[str] = set()
    unique: list[str] = []
    for token in tokens:
        if token and token not in seen:
            seen.add(token)
            unique.append(token)
    return unique
