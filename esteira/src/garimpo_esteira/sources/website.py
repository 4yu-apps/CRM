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

# WhatsApp: link wa.me/<num> ou .../send?phone=<num>. O numero costuma vir com
# o 55 do Brasil; a normalizacao tira depois.
_WA_RE = re.compile(
    r"(?:wa\.me/|(?:api\.)?whatsapp\.com/send/?\?phone=|whatsapp://send\?phone=)(\d{8,15})",
    re.IGNORECASE,
)
# Facebook: pagina do negocio. Captura facebook.com/<slug> e fb.com/<slug>.
_FB_RE = re.compile(r"(?:facebook\.com|fb\.com)/([A-Za-z0-9_.\-]{2,60})", re.IGNORECASE)
# caminhos do facebook que nao sao pagina de negocio
_FB_SKIP = {
    "sharer", "share", "sharer.php", "dialog", "plugins", "tr", "tr:", "login",
    "l.php", "help", "policies", "privacy", "terms", "watch", "events", "groups",
    "story.php", "photo.php", "permalink.php", "profile.php", "pages", "hashtag",
    "people", "public", "p", "home.php", "recover", "legal",
}
# Telefone: pega de links tel: (mais confiavel que texto solto na pagina).
_TEL_RE = re.compile(r"tel:\+?([\d\s().\-]{8,})", re.IGNORECASE)


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


def extract_whatsapp(html: str) -> str | None:
    for num in _WA_RE.findall(html or ""):
        zap = clean("whatsapp", num)
        if zap:
            return zap
    return None


def extract_facebook(html: str) -> str | None:
    for slug in _FB_RE.findall(html or ""):
        s = slug.strip("/.").lower()
        if not s or s in _FB_SKIP or _IG_BAD.search(s):
            continue
        return clean("facebook", s)
    return None


def extract_phone(html: str) -> str | None:
    for raw in _TEL_RE.findall(html or ""):
        tel = clean("phone", raw)
        if tel:
            return tel
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
            zap = extract_whatsapp(html)
            if zap:
                findings.append(Finding("whatsapp", self.name, zap, 0.7))
            fb = extract_facebook(html)
            if fb:
                findings.append(Finding("facebook", self.name, fb, 0.6))
            tel = extract_phone(html)
            if tel:
                # so vira coluna se o lead ainda nao tem telefone (cascade decide);
                # aqui a gente registra o achado pra proveniencia.
                findings.append(Finding("phone", self.name, tel, 0.5))
        elif self._reachable(site):
            findings.append(Finding("website", self.name, site, 0.9))
        return findings
