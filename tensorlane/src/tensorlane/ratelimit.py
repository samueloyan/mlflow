"""Rate limits by principal and endpoint class. Redis when configured; memory otherwise."""

from __future__ import annotations

import threading
import time
from collections import defaultdict, deque

from tensorlane.errors import RateLimitedError

_lock = threading.Lock()
_windows: dict[str, deque[float]] = defaultdict(deque)


def allow(key: str, limit: int, window_seconds: int = 60) -> None:
    if limit <= 0:
        return
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _windows[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise RateLimitedError("Too many requests. Slow down and retry.")
        bucket.append(now)
