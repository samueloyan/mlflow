from __future__ import annotations

from typing import Any, Literal

LimitBehavior = Literal["soft", "hard", "throttle", "overage", "upgrade"]

PLANS: dict[str, dict[str, Any]] = {
    "free": {
        "features": {
            "advanced_evaluations": False,
            "audit_logs": True,
            "sso": False,
            "scim": False,
            "dedicated_isolation": False,
            "approvals": False,
            "quality_monitoring": False,
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
        "price_usd_month": 0,
        "unit_cost_usd": {
            "monthly_traces": 0.00002,
            "monthly_runs": 0.01,
            "storage_gb": 0.23,
            "monthly_api_requests": 0.000002,
        },
    },
    "team": {
        "features": {
            "advanced_evaluations": False,
            "audit_logs": True,
            "sso": False,
            "scim": False,
            "dedicated_isolation": False,
            "approvals": True,
            "quality_monitoring": True,
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
        "price_usd_month": 99,
        "unit_cost_usd": {
            "monthly_traces": 0.000015,
            "monthly_runs": 0.008,
            "storage_gb": 0.18,
            "monthly_api_requests": 0.0000015,
        },
    },
    "growth": {
        "features": {
            "advanced_evaluations": True,
            "audit_logs": True,
            "sso": False,
            "scim": False,
            "dedicated_isolation": False,
            "approvals": True,
            "quality_monitoring": True,
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
        "price_usd_month": 499,
        "unit_cost_usd": {
            "monthly_traces": 0.00001,
            "monthly_runs": 0.005,
            "storage_gb": 0.12,
            "monthly_api_requests": 0.000001,
        },
    },
    "enterprise": {
        "features": {
            "advanced_evaluations": True,
            "audit_logs": True,
            "sso": True,
            "scim": True,
            "dedicated_isolation": True,
            "approvals": True,
            "quality_monitoring": True,
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
        "price_usd_month": 0,
        "unit_cost_usd": {
            "monthly_traces": 0.000006,
            "monthly_runs": 0.003,
            "storage_gb": 0.08,
            "monthly_api_requests": 0.0000005,
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

    @staticmethod
    def list_plans() -> list[dict[str, Any]]:
        out = []
        for name, doc in PLANS.items():
            out.append({
                "id": name,
                "price_usd_month": doc.get("price_usd_month", 0),
                "features": doc["features"],
                "limits": doc["limits"],
                "limit_behavior": doc["limit_behavior"],
                "custom": name == "enterprise",
            })
        return out

    def unit_cost(self, metric: str) -> float:
        return float(self._doc.get("unit_cost_usd", {}).get(metric, 0))

    def require_feature(self, feature: str) -> None:
        from tensorlane.errors import AuthorizationError

        if not self.can_use(feature):
            raise AuthorizationError(
                "PLAN_FEATURE_REQUIRED",
                f"The {self.plan} plan does not include {feature}.",
            )

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
        return
