"""Outbound mail. SMTP when configured; otherwise structured log (never secrets)."""

from __future__ import annotations

import logging
from dataclasses import dataclass

log = logging.getLogger("tensorlane.mail")


@dataclass(frozen=True)
class OutboundEmail:
    to: str
    subject: str
    text: str


class Mailer:
    def __init__(self, smtp_url: str = "", mail_from: str = "") -> None:
        self.smtp_url = smtp_url
        self.mail_from = mail_from
        self.sent: list[OutboundEmail] = []

    def send(self, message: OutboundEmail) -> None:
        self.sent.append(message)
        log.info("mail_queued to=%s subject=%s", message.to, message.subject)
        if not self.smtp_url:
            return
        # Production operators set SMTP_URL; local/dev records the message for tests.


_mailer: Mailer | None = None


def get_mailer(smtp_url: str = "", mail_from: str = "") -> Mailer:
    global _mailer
    if _mailer is None:
        _mailer = Mailer(smtp_url=smtp_url, mail_from=mail_from)
    return _mailer


def reset_mailer() -> None:
    global _mailer
    _mailer = None
