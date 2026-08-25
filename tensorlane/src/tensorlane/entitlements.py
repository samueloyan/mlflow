from __future__ import annotations

from typing import Any, Literal

LimitBehavior = Literal["soft", "hard", "throttle", "overage", "upgrade"]

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "features": {
            "advanced_evaluations": False,
            "audit_logs": True,
            "sso": False,
        },
        "limits": {
            "members": 5,
            "storage_gb": 2,
            "monthly_traces": 50_000,
            "monthly_runs": 1_000,
            "monthly_api_requests": 200_000,
        },
        "limit_behavior": {
            "members": "hard",
            "storage_gb": "hard",
            "monthly_traces": "soft",
            "monthly_runs": "soft",
            "monthly_api_requests": "throttle",
        },
    },
    "team": {
        "features": {
            "advanced_evaluations": False,
            "audit_logs": True,
            "sso": False,
        },
        "limits": {
            "members": 20,
            "storage_gb": 50,
            "monthly_traces": 500_000,
            "monthly_runs": 20_000,
            "monthly_api_requests": 2_000_000,
        },
        "limit_behavior": {
            "members": "hard",
            "storage_gb": "hard",
            "monthly_traces": "soft",
            "monthly_runs": "soft",
            "monthly_api_requests": "throttle",
        },
    },
    "growth": {
        "features": {
            "advanced_evaluations": True,
            "audit_logs": True,
            "sso": False,
        },
        "limits": {
            "members": 50,
            "storage_gb": 250,
            "monthly_traces": 5_000_000,
            "monthly_runs": 100_000,
            "monthly_api_requests": 20_000_000,
        },
        "limit_behavior": {
            "members": "hard",
            "storage_gb": "hard",
            "monthly_traces": "soft",
            "monthly_runs": "soft",
            "monthly_api_requests": "throttle",
        },
    },
    "enterprise": {
        "features": {
            "advanced_evaluations": True,
            "audit_logs": True,
            "sso": True,
        },
        "limits": {
            "members": 10_000,
            "storage_gb": 10_000,
            "monthly_traces": 100_000_000,
            "monthly_runs": 1_000_000,
            "monthly_api_requests": 200_000_000,
        },
        "limit_behavior": {
            "members": "hard",
            "storage_gb": "hard",
            "monthly_traces": "soft",
            "monthly_runs": "soft",
            "monthly_api_requests": "throttle",
        },
    },
}

WARNING_RATIO = 0.8


class EntitlementService:
    def __init__(self, plan: str) -> None:
        key = plan.lower()
        if key not in PLANS:
            raise ValueError(f"Unknown plan '{plan}'")
        self.plan = key
        self._doc = PLANS[key]

    def can_use(self, feature: str) -> bool:
        return bool(self._doc["features"].get(feature, False))

    def get_limit(self, metric: str) -> float:
        return float(self._doc["limits"][metric])

    def get_behavior(self, metric: str) -> LimitBehavior:
        return self._doc["limit_behavior"][metric]

    def warning_threshold(self, metric: str) -> float:
        return self.get_limit(metric) * WARNING_RATIO

    def is_over_limit(self, metric: str, current: float) -> bool:
        return current >= self.get_limit(metric)

    def is_warning(self, metric: str, current: float) -> bool:
        return current >= self.warning_threshold(metric) and not self.is_over_limit(metric, current)

    def enforce(self, metric: str, current: float, incoming: float = 0) -> None:
        from tensorlane.errors import LimitExceededError, RateLimitedError

        projected = current + incoming
        if projected < self.get_limit(metric):
            return
        behavior = self.get_behavior(metric)
        if behavior == "hard":
            raise LimitExceededError(
                f"Organization has reached the {metric} limit for the {self.plan} plan.",
                metric,
            )
        if behavior == "throttle":
            raise RateLimitedError(
                f"Organization has reached the {metric} limit for the {self.plan} plan."
            )
        # soft, overage, upgrade: warn via usage API, do not destroy workloads
        return
