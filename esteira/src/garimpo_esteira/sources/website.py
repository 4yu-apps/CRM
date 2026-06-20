"""Fonte site, confirma o site e raspa Instagram + e-mail dele.

O Maps ja entrega o website (quando existe). Aqui a gente confirma que ele
responde e, de quebra, le a pagina atras de Instagram e e-mail de contato, que
o Maps nunca da. Ausencia de site continua sendo SINAL (lead quente pra design /
trafego), nao erro.
"""
from __future__ import annotations

import re
from typing import Callable

import httpx

from ..models import Finding, Lead
from ..validation import clean

# reachable(url) -> True se responde (2xx/3xx)
ReachFn = Callable[[str], bool]
# fetch_html(url) -> html (str) ou None. Injetavel pra teste (offline).
FetchHtmlFn = Callable[[str], str | None]

_IG_RE = re.compile(r"instagram\.com/([A-Za-z0-9_.]{2,40})", re.IGNORECASE)
_EMAIL_RE = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}")
# caminhos do instagram que nao sao perfil de negocio
_IG_SKIP = {"p", "reel", "reels", "explore", "accounts", "about", "developer", "legal", "tv", "static"}
# lixo de widget/CDN (ex.: instagram.com/static/rsrc.php do Facebook embed)
_IG_BAD = re.compile(r"\.(php|js|html?|aspx?|png|jpe?g|gif|svg|css)$|rsrc", re.IGNORECASE)
# e-mails de plataforma/tracking que nao sao contato real
_EMAIL_JUNK = ("sentry", "wixpress", "example.", "@2x", ".png", ".jpg", "@sentry")


def _norm_url(url: str) -> str:
    return url if url.startswith(("http://", "https://")) else "https://" + url


def http_reachable(url: str, *, client: httpx.Client | None = None, timeout: float = 8.0) -> bool:
    url = _norm_url(url)
    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True,
                                    headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.head(url)
        if resp.status_code >= 400:
            resp = client.get(url)
        return resp.status_code < 400
    except httpx.HTTPError:
        return False
    finally:
        if own:
            client.close()


def http_fetch_html(url: str, *, client: httpx.Client | None = None, timeout: float = 8.0) -> str | None:
    url = _norm_url(url)
    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True,
                                    headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.get(url)
        if resp.status_code >= 400:
            return None
        return resp.text[:200_000]  # teto: nao processa pagina gigante
    except httpx.HTTPError:
        return None
    finally:
        if own:
            client.close()


def extract_instagram(html: str) -> str | None:
    for handle in _IG_RE.findall(html or ""):
        h = handle.strip("/.").lower()
        if not h or h in _IG_SKIP or _IG_BAD.search(h):
            continue
        return clean("instagram", h)
    return None


def extract_email(html: str) -> str | None:
    for email in _EMAIL_RE.findall(html or ""):
        low = email.lower()
        if any(j in low for j in _EMAIL_JUNK):
            continue
        return clean("email", email)
    return None


class WebsiteSource:
    name = "website"

    def __init__(self, reachable: ReachFn | None = None, fetch_html: FetchHtmlFn | None = None):
        self._reachable = reachable or http_reachable
        # None = busca real; injetar (ex.: lambda _u: None) deixa offline/deterministico
        self._fetch_html = fetch_html if fetch_html is not None else http_fetch_html

    def enrich(self, lead: Lead) -> list[Finding]:
        site = clean("website", lead.website)
        if not site:
            return []  # sem site: sinal tratado no score, nao aqui

        findings: list[Finding] = []
        html = self._fetch_html(site)
        if html:
            findings.append(Finding("website", self.name, site, 0.9))  # confirmado, respondeu
            ig = extract_instagram(html)
            if ig:
                findings.append(Finding("instagram", self.name, ig, 0.6))
            email = extract_email(html)
            if email:
                findings.append(Finding("email", self.name, email, 0.5))
        elif self._reachable(site):
            findings.append(Finding("website", self.name, site, 0.9))
        return findings
