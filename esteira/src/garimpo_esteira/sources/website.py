"""Fonte site, confirma o site e raspa Instagram + e-mail dele.

O Maps ja entrega o website (quando existe). Aqui a gente confirma que ele
responde e, de quebra, le a pagina atras de Instagram e e-mail de contato, que
o Maps nunca da. Ausencia de site continua sendo SINAL (lead quente pra design /
trafego), nao erro.
"""
from __future__ import annotations

import json
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


# --- sinais tecnicos do site (de graca, do HTML que ja baixamos) -----------
# Respondem as perguntas que tarfego/automacao/UX precisam, sem API paga e sem
# a Biblioteca de Anuncios da Meta. Cada um e um regex barato no HTML.
_FB_PIXEL_RE = re.compile(r"fbq\(|fbevents\.js|connect\.facebook\.net/[^\"']*fbevents|/tr\?id=\d+", re.I)
_GOOGLE_TAG_RE = re.compile(r"googletagmanager\.com/gtag|gtag\(|google-analytics\.com|googleadservices\.com|google_conversion", re.I)
_VIEWPORT_RE = re.compile(r"<meta[^>]+name=[\"']viewport[\"']", re.I)
_H1_RE = re.compile(r"<h1[\s>]", re.I)
_TITLE_RE = re.compile(r"<title[\s>][^<]*\S[^<]*</title>", re.I)
_DESC_RE = re.compile(r"<meta[^>]+name=[\"']description[\"'][^>]*content=[\"'][^\"']+", re.I)
_OGIMG_RE = re.compile(r"<meta[^>]+property=[\"']og:image[\"']", re.I)
_FORM_RE = re.compile(r"<form[\s>]", re.I)
# widgets de chat/atendimento (vendor -> regex)
_CHAT_VENDORS = {
    "tawk": r"tawk\.to",
    "zendesk": r"zendesk|zdassets|zopim",
    "crisp": r"crisp\.chat",
    "manychat": r"manychat",
    "jivochat": r"jivo(?:site|chat)",
    "rdstation": r"rdstation|rdmkt",
    "intercom": r"intercom",
    "drift": r"drift\.com",
    "hubspot": r"hs-scripts|js\.hs-scripts",
}
# stack/construtor do site (pelo HTML/markup conhecido)
_STACKS = {
    "wix": r"wix\.com|wixstatic|_wix",
    "wordpress": r"wp-content|wp-includes|/wp-json",
    "squarespace": r"squarespace",
    "webflow": r"webflow",
    "shopify": r"cdn\.shopify|myshopify",
    "loja_integrada": r"lojaintegrada",
}


def extract_site_signals(html: str, *, url: str = "") -> dict:
    """Diagnostico tecnico do site a partir do HTML. Tudo de graca.

    has_fb_pixel/has_google_tag: rastreamento de anuncio (responde "ja anuncia?"
    sem a API da Meta). has_chat_widget/has_form: sinais de automacao. mobile_
    ready/slow/stack/has_h1/has_title/has_description/https: qualidade do site
    (UX/web). page_kb: peso aproximado.
    """
    h = html or ""
    chat_vendor = next((v for v, rx in _CHAT_VENDORS.items() if re.search(rx, h, re.I)), None)
    stack = next((s for s, rx in _STACKS.items() if re.search(rx, h, re.I)), None)
    page_kb = round(len(h.encode("utf-8", "ignore")) / 1024)
    return {
        "has_fb_pixel": bool(_FB_PIXEL_RE.search(h)),
        "has_google_tag": bool(_GOOGLE_TAG_RE.search(h)),
        "has_chat_widget": chat_vendor is not None,
        "chat_vendor": chat_vendor,
        "has_form": bool(_FORM_RE.search(h)),
        "mobile_ready": bool(_VIEWPORT_RE.search(h)),
        "page_kb": page_kb,
        "slow": page_kb > 1500,
        "stack": stack,
        "https": url.startswith("https://"),
        "has_h1": bool(_H1_RE.search(h)),
        "has_title": bool(_TITLE_RE.search(h)),
        "has_description": bool(_DESC_RE.search(h)),
        "og_image": bool(_OGIMG_RE.search(h)),
    }


class WebsiteSource:
    name = "website"

    def __init__(
        self,
        reachable: ReachFn | None = None,
        fetch_html: FetchHtmlFn | None = None,
        llm_extract=None,
    ):
        self._reachable = reachable or http_reachable
        # None = busca real; injetar (ex.: lambda _u: None) deixa offline/deterministico
        self._fetch_html = fetch_html if fetch_html is not None else http_fetch_html
        # extrator LLM opcional (Groq, gratis): reforça o regex quando ele nao
        # acha contato. None = so regex.
        self._llm_extract = llm_extract

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

            # Sinais tecnicos do site (de graca). Viram a coluna site_signals
            # (cascade trata o JSON). Se achar Pixel/tag de anuncio, deriva
            # ads_active=sim ("ja anuncia?") sem depender da API da Meta.
            sig = extract_site_signals(html, url=site)
            findings.append(Finding("site_signals", self.name, json.dumps(sig), 0.9))
            if sig["has_fb_pixel"] or sig["has_google_tag"]:
                findings.append(Finding("ads_active", self.name, "sim", 0.6))

            # Reforço por LLM: so quando o regex nao achou nenhuma rede/whatsapp
            # (lead pobre de contato), pra limitar chamadas. Preenche so o que
            # falta; falha vira {} e segue so com o regex.
            achou = {f.field_name for f in findings}
            if self._llm_extract and not ({"instagram", "facebook", "whatsapp"} & achou):
                try:
                    extra = self._llm_extract(html, lead.business_name or "")
                except Exception:
                    extra = {}
                for field_name, value in (extra or {}).items():
                    if field_name not in achou and value:
                        findings.append(Finding(field_name, self.name, value, 0.55))
                        achou.add(field_name)
        elif self._reachable(site):
            findings.append(Finding("website", self.name, site, 0.9))
        return findings
