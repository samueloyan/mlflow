"""Billing provider. Stripe when keys exist; sandbox otherwise. Never trust client plan state."""

from __future__ import annotations

import hashlib
import hmac
import json
from dataclasses import dataclass
from typing import Protocol

from tensorlane.config import Settings
from tensorlane.errors import ConflictError, TensorlaneError


@dataclass(frozen=True)
class CheckoutSession:
    id: str
    url: str
    plan: str


@dataclass(frozen=True)
class PortalSession:
    url: str


class BillingProvider(Protocol):
    def create_checkout(
        self, *, organization_id: str, plan: str, success_url: str, cancel_url: str
    ) -> CheckoutSession: ...

    def create_portal(self, *, customer_id: str, return_url: str) -> PortalSession: ...

    def parse_webhook(self, payload: bytes, signature: str | None) -> dict: ...


class SandboxBilling:
    """Local and CI billing. Applies plans without moving money."""

    def create_checkout(
        self, *, organization_id: str, plan: str, success_url: str, cancel_url: str
    ) -> CheckoutSession:
        _ = cancel_url
        token = f"cs_test_{organization_id[-8:]}_{plan}"
        separator = "&" if "?" in success_url else "?"
        return CheckoutSession(
            id=token,
            url=f"{success_url}{separator}session_id={token}&plan={plan}",
            plan=plan,
        )

    def create_portal(self, *, customer_id: str, return_url: str) -> PortalSession:
        _ = customer_id
        return PortalSession(url=return_url)

    def parse_webhook(self, payload: bytes, signature: str | None) -> dict:
        _ = signature
        return json.loads(payload.decode("utf-8"))


class StripeBilling:
    def __init__(self, settings: Settings) -> None:
        self.settings = settings

    def _price_id(self, plan: str) -> str:
        mapping = {
            "team": self.settings.stripe_price_team,
            "growth": self.settings.stripe_price_growth,
        }
        price = mapping.get(plan, "")
        if not price:
            raise ConflictError("Stripe price is not configured for this plan.")
        return price

    def create_checkout(
        self, *, organization_id: str, plan: str, success_url: str, cancel_url: str
    ) -> CheckoutSession:
        import httpx

        price = self._price_id(plan)
        if "{CHECKOUT_SESSION_ID}" not in success_url:
            separator = "&" if "?" in success_url else "?"
            success_url = f"{success_url}{separator}session_id={{CHECKOUT_SESSION_ID}}"
        response = httpx.post(
            "https://api.stripe.com/v1/checkout/sessions",
            auth=(self.settings.stripe_secret_key, ""),
            data={
                "mode": "subscription",
                "success_url": success_url,
                "cancel_url": cancel_url,
                "line_items[0][price]": price,
                "line_items[0][quantity]": "1",
                "client_reference_id": organization_id,
                "metadata[organization_id]": organization_id,
                "metadata[plan]": plan,
            },
            timeout=20.0,
        )
        if response.status_code >= 400:
            raise TensorlaneError("BILLING_PROVIDER_ERROR", "Unable to start checkout.", 502)
        body = response.json()
        return CheckoutSession(id=body["id"], url=body["url"], plan=plan)

    def create_portal(self, *, customer_id: str, return_url: str) -> PortalSession:
        import httpx

        response = httpx.post(
            "https://api.stripe.com/v1/billing_portal/sessions",
            auth=(self.settings.stripe_secret_key, ""),
            data={"customer": customer_id, "return_url": return_url},
            timeout=20.0,
        )
        if response.status_code >= 400:
            raise TensorlaneError(
                "BILLING_PROVIDER_ERROR", "Unable to open the billing portal.", 502
            )
        return PortalSession(url=response.json()["url"])

    def parse_webhook(self, payload: bytes, signature: str | None) -> dict:
        secret = self.settings.stripe_webhook_secret
        if not secret:
            raise TensorlaneError("WEBHOOK_INVALID", "Webhook secret is not configured.", 400)
        if not signature or not _stripe_signature_valid(payload, signature, secret):
            raise TensorlaneError("WEBHOOK_INVALID", "Invalid Stripe signature.", 400)
        return json.loads(payload.decode("utf-8"))


def _stripe_signature_valid(payload: bytes, header: str, secret: str, tolerance: int = 300) -> bool:
    import time

    parts = dict(item.split("=", 1) for item in header.split(",") if "=" in item)
    timestamp = parts.get("t")
    expected = parts.get("v1")
    if not timestamp or not expected:
        return False
    try:
        if abs(int(time.time()) - int(timestamp)) > tolerance:
            return False
    except ValueError:
        return False
    signed = f"{timestamp}.".encode() + payload
    digest = hmac.new(secret.encode("utf-8"), signed, hashlib.sha256).hexdigest()
    return hmac.compare_digest(digest, expected)


def get_billing(settings: Settings) -> BillingProvider:
    if settings.stripe_configured:
        return StripeBilling(settings)
    return SandboxBilling()
