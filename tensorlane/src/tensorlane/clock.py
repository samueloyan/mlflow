from __future__ import annotations

from datetime import datetime, timezone


def utcnow() -> datetime:
    """Naive UTC timestamp for SQLite-friendly DateTime columns."""
    return datetime.now(timezone.utc).replace(tzinfo=None)
