"""Outbound mail. SMTP when configured; otherwise structured log (never secrets)."""

from __future__ import annotations

import logging
import smtplib
from dataclasses import dataclass
from email.message import EmailMessage
from urllib.parse import unquote, urlparse

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
        try:
            self._deliver(message)
            log.info("mail_sent to=%s", message.to)
        except Exception:
            log.exception("mail_send_failed to=%s", message.to)

    def _deliver(self, message: OutboundEmail) -> None:
        parsed = urlparse(self.smtp_url)
        host = parsed.hostname
        if not host:
            raise ValueError("SMTP_URL has no host")
        use_ssl = parsed.scheme in {"smtps", "smtp+ssl"}
        port = parsed.port or (465 if use_ssl else 587)
        user = unquote(parsed.username) if parsed.username else ""
        password = unquote(parsed.password) if parsed.password else ""
        envelope = EmailMessage()
        envelope["Subject"] = message.subject
        envelope["From"] = self.mail_from or "Tensorlane <noreply@tensorlane.ai>"
        envelope["To"] = message.to
        envelope.set_content(message.text)
        client: smtplib.SMTP
        if use_ssl:
            client = smtplib.SMTP_SSL(host, port, timeout=15)
        else:
            client = smtplib.SMTP(host, port, timeout=15)
        with client:
            client.ehlo()
            if not use_ssl and parsed.scheme in {"", "smtp", "smtp+starttls"}:
                try:
                    client.starttls()
                    client.ehlo()
                except smtplib.SMTPNotSupportedError:
                    pass
            if user:
                client.login(user, password)
            client.send_message(envelope)


_mailer: Mailer | None = None


def get_mailer(smtp_url: str = "", mail_from: str = "") -> Mailer:
    global _mailer
    if _mailer is None:
        _mailer = Mailer(smtp_url=smtp_url, mail_from=mail_from)
    elif smtp_url and not _mailer.smtp_url:
        _mailer.smtp_url = smtp_url
        _mailer.mail_from = mail_from or _mailer.mail_from
    return _mailer


def reset_mailer() -> None:
    global _mailer
    _mailer = None
