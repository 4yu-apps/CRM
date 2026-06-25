"""Sinais empresariais gratuitos e conservadores.

Usa libphonenumber localmente, DNS MX e RDAP publico. O host HTTP e fixo
(rdap.org) e o dominio coletado e validado antes de qualquer consulta.
Falhas de rede viram ausencia de sinal, nunca erro de cascata.
"""
from __future__ import annotations

import ipaddress
import json
import re
from datetime import date, datetime
from urllib.parse import quote, urlparse

import httpx

from ..models import Finding, Lead

_DOMAIN_RE = re.compile(
    r"^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"
)
_FREE_EMAIL_DOMAINS = {
    "gmail.com", "googlemail.com", "hotmail.com", "outlook.com", "live.com",
    "yahoo.com", "yahoo.com.br", "icloud.com", "bol.com.br", "uol.com.br",
}


def phone_type(phone: str | None) -> str | None:
    if not phone:
        return None
    try:
        import phonenumbers
        from phonenumbers import PhoneNumberType

        number = phonenumbers.parse(phone, "BR")
        if not phonenumbers.is_valid_number(number):
            return None
        kind = phonenumbers.number_type(number)
        if kind in (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE):
            return "celular"
        if kind == PhoneNumberType.FIXED_LINE:
            return "fixo"
    except Exception:
        return None
    return None


def _valid_domain(raw: str | None) -> str | None:
    if not raw:
        return None
    host = raw.strip().lower().rstrip(".")
    if host.startswith("www."):
        host = host[4:]
    try:
        host = host.encode("idna").decode("ascii")
        ipaddress.ip_address(host)
        return None
    except ValueError:
        pass
    except UnicodeError:
        return None
    if host == "localhost" or host.endswith((".local", ".internal", ".localhost")):
        return None
    return host if _DOMAIN_RE.fullmatch(host) else None


def domain_from(lead: Lead) -> str | None:
    if lead.website:
        parsed = urlparse(
            lead.website if "://" in lead.website else f"https://{lead.website}"
        )
        host = _valid_domain(parsed.hostname)
        if host:
            return host
    if lead.email and "@" in lead.email:
        return _valid_domain(lead.email.rsplit("@", 1)[1])
    return None


def _resolve_mx(domain: str) -> list[str]:
    import dns.resolver

    answers = dns.resolver.resolve(domain, "MX", lifetime=5.0)
    return [str(record.exchange).lower().rstrip(".") for record in answers]


def email_provider(domain: str | None) -> str | None:
    domain = _valid_domain(domain)
    if not domain:
        return None
    if domain in _FREE_EMAIL_DOMAINS:
        return "gratuito"
    try:
        hosts = " ".join(_resolve_mx(domain))
    except Exception:
        return None
    if not hosts:
        return None
    if "google" in hosts or "googlemail" in hosts:
        return "google_workspace"
    if "outlook" in hosts or "microsoft" in hosts:
        return "microsoft365"
    return "outro"


def _rdap_created(domain: str) -> str | None:
    domain = _valid_domain(domain)
    if not domain:
        return None
    try:
        response = httpx.get(
            f"https://rdap.org/domain/{quote(domain, safe='.-')}",
            timeout=8.0,
            headers={"User-Agent": "garimpo-esteira"},
            follow_redirects=True,
        )
        if response.status_code != 200:
            return None
        for event in response.json().get("events", []):
            if event.get("eventAction") == "registration":
                return event.get("eventDate")
    except (httpx.HTTPError, ValueError, TypeError):
        return None
    return None


def _age_days(iso: str | None, *, today: date | None = None) -> int | None:
    if not iso:
        return None
    try:
        created = datetime.fromisoformat(iso.replace("Z", "+00:00")).date()
        return max(0, ((today or date.today()) - created).days)
    except (ValueError, TypeError):
        return None


class BizSignalsSource:
    name = "biz_signals"

    def enrich(self, lead: Lead) -> list[Finding]:
        signals: dict[str, object] = {}

        kind = phone_type(lead.phone)
        if kind:
            signals["phone_type"] = kind

        domain = domain_from(lead)
        if domain:
            provider = email_provider(domain)
            if provider:
                signals["email_provider"] = provider
            created = _rdap_created(domain)
            if created:
                signals["domain_created"] = created
                age = _age_days(created)
                if age is not None:
                    signals["domain_age_days"] = age

        if not signals:
            return []
        return [
            Finding(
                "site_signals",
                self.name,
                json.dumps(signals, ensure_ascii=False),
                0.8,
            )
        ]
