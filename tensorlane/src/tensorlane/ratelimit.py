"""Rate limits by principal and endpoint class. Redis when configured; memory otherwise."""

from __future__ import annotations

import logging
import threading
import time
from collections import defaultdict, deque

from tensorlane.errors import RateLimitedError

log = logging.getLogger("tensorlane.ratelimit")

_lock = threading.Lock()
_windows: dict[str, deque[float]] = defaultdict(deque)
_redis = None
_redis_failed = False


def _redis_client(url: str):
    global _redis, _redis_failed
    if _redis_failed:
        return None
    if _redis is not None:
        return _redis
    try:
        import redis
    except ImportError:
        _redis_failed = True
        return None
    _redis = redis.Redis.from_url(
        url, socket_connect_timeout=0.4, socket_timeout=0.4, decode_responses=True
    )
    return _redis


def allow(key: str, limit: int, window_seconds: int = 60, redis_url: str | None = None) -> None:
    if limit <= 0:
        return
    if redis_url:
        client = _redis_client(redis_url)
        if client is not None:
            namespaced = f"tl:rl:{key}"
            try:
                count = int(client.incr(namespaced))
                if count == 1:
                    client.expire(namespaced, window_seconds)
                if count > limit:
                    raise RateLimitedError("Too many requests. Slow down and retry.")
                return
            except RateLimitedError:
                raise
            except Exception:
                log.warning("redis_rate_limit_failed key=%s", key)
    now = time.monotonic()
    cutoff = now - window_seconds
    with _lock:
        bucket = _windows[key]
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= limit:
            raise RateLimitedError("Too many requests. Slow down and retry.")
        bucket.append(now)
