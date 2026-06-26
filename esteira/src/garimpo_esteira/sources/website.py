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
# caminhos do instagram que nao sao perfil de negocio (inclui os paths INTERNOS
# do proprio Instagram tipo /_n/ /_u/ /graphql/ que apareciam como handle "_n").
_IG_SKIP = {
    "p", "reel", "reels", "explore", "accounts", "about", "developer", "legal",
    "tv", "static", "graphql", "web", "api", "ajax", "embed", "embeds", "oauth",
    "directory", "emails", "challenge", "session", "direct", "stories", "privacy",
    "terms", "_n", "_u", "_e", "_a", "_i", "_o", "_imp", "_nc",
}
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


def _ig_ok(h: str) -> bool:
    # handle valido: >=3 chars, nao e path interno/reservado, sem extensao de
    # arquivo. Pega o lixo "_n" (path interno do Instagram) e afins.
    return len(h) >= 3 and h not in _IG_SKIP and not _IG_BAD.search(h)


def extract_instagram(html: str) -> str | None:
    for handle in _IG_RE.findall(html or ""):
        h = handle.strip("/.").lower()
        if _ig_ok(h):
            return clean("instagram", h)
    return None


def ig_handle_from_url(url: str) -> str | None:
    """Extrai o @ de um link de perfil do Instagram (quando o 'site' do Maps e,
    na verdade, o Instagram do negocio)."""
    m = _IG_RE.search(url or "")
    if not m:
        return None
    h = m.group(1).strip("/.").lower()
    return clean("instagram", h) if _ig_ok(h) else None


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


# CNPJ no rodape do site (quase todo site BR formal mostra). So o padrao
# FORMATADO XX.XXX.XXX/XXXX-XX: 14 digitos soltos dariam falso positivo (qualquer
# numero), e normalize_cnpj nao valida digito verificador. Destrava a cadeia CNPJ
# (dono, opened_on, situacao) pros leads de Maps/OSM que nunca trazem CNPJ.
_CNPJ_RE = re.compile(r"\d{2}\.\d{3}\.\d{3}/\d{4}-\d{2}")


def extract_cnpj(html: str) -> str | None:
    for raw in _CNPJ_RE.findall(html or ""):
        cnpj = clean("cnpj", raw)
        if cnpj:
            return cnpj
    return None


# --- sinais tecnicos do site (de graca, do HTML que ja baixamos) -----------
# Respondem as perguntas que tarfego/automacao/UX precisam, sem API paga e sem
# a Biblioteca de Anuncios da Meta. Cada um e um regex barato no HTML.
#
# "Ja anuncia?" precisa de PIXEL DE ANUNCIO (Meta/Google Ads/TikTok), nao de
# analytics. Ter Google Analytics/GTM NAO prova que anuncia (quase todo site tem
# medicao). Por isso o Google Ads (tag de conversao AW-/googleadservices) fica
# SEPARADO do analytics generico (has_google_tag).
_FB_PIXEL_RE = re.compile(r"fbq\(|fbevents\.js|connect\.facebook\.net/[^\"']*fbevents|/tr\?id=\d+", re.I)
# Google Ads de verdade: tag de conversao/remarketing (AW-...), googleadservices,
# doubleclick. Isso sim e anuncio pago no Google.
_GOOGLE_ADS_RE = re.compile(
    r"googleadservices\.com|google_conversion|googleads\.g\.doubleclick|gtag\([^)]*['\"]AW-|['\"]AW-\d{6,}",
    re.I,
)
# TikTok pixel (events.js / ttq.load).
_TIKTOK_PIXEL_RE = re.compile(r"analytics\.tiktok\.com|ttq\.load|TiktokAnalyticsObject", re.I)
# Analytics/medicao generica (GA4/GTM/UA): maturidade digital, NAO anuncio.
_GOOGLE_TAG_RE = re.compile(
    r"googletagmanager\.com|gtag\(|google-analytics\.com|['\"]G-[A-Z0-9]{6,}|UA-\d{4,}", re.I
)
# Outros canais sociais alem de IG/FB (o gestor quer saber onde o negocio ja esta).
_TIKTOK_CH_RE = re.compile(r"tiktok\.com/@", re.I)
_YOUTUBE_CH_RE = re.compile(r"youtube\.com/(?:@|c/|channel/|user/)|youtu\.be/", re.I)
_LINKEDIN_CH_RE = re.compile(r"linkedin\.com/(?:company|in)/", re.I)
# Agendamento online (ouro pra automacao: ja tenta agendar, da pra integrar).
_BOOKING_RE = re.compile(
    r"calendly\.com|booksy|simplybook|setmore|appointlet|trinks\.com|agendor\.com|"
    r"agende\s+on\s*-?\s*line|agendamento\s+online|agende\s+online",
    re.I,
)
# E-commerce/checkout (vende online: muda o tipo de campanha do gestor).
_ECOMM_RE = re.compile(
    r"cdn\.shopify|myshopify|woocommerce|wp-content/plugins/woocommerce|nuvemshop|"
    r"tiendanube|vtex|loja\s*integrada|/cart\b|/checkout\b|/carrinho\b|"
    r"adicionar ao carrinho|finalizar compra",
    re.I,
)
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


# Link-na-bio (Linktree e similares) e presenca em marketplace: sinais GRATIS de
# maturidade digital extraidos do HTML que ja baixamos (zero chamada nova).
_LINKTREE_RE = re.compile(r"linktr\.ee|lit\.link|beacons\.ai|bio\.link|linkr\.bio|campsite\.bio", re.I)
_MARKETPLACE_RE = re.compile(r"mercadolivre\.com|mercadolibre\.com|shopee\.com|elo7\.com|magazinevoce|/loja/", re.I)

# horario de atendimento no texto (rodape/sessao "horario"): casa um dia/rotulo
# perto de um horario (9h, 09:00, 9h30). So uma DICA em texto; a IA normaliza.
_HOURS_RE = re.compile(
    r"(?:hor[áa]rio|funcionamento|atendiment|aberto|seg(?:unda)?|ter[çc]a|quart|quint|sext|s[áa]bado|domingo)"
    r"[^<]{0,140}?\d{1,2}\s*(?:h|:|hs|horas)\s*\d{0,2}",
    re.I,
)


def extract_hours_hint(html: str) -> str | None:
    """Acha uma DICA de horario de atendimento no texto do site (rodape costuma
    ter). Devolve um trecho curto legivel, ou None. A IA normaliza depois."""
    txt = re.sub(r"<(script|style)[\s\S]*?</\1>", " ", html or "", flags=re.I)
    txt = re.sub(r"<[^>]+>", " ", txt)
    txt = re.sub(r"\s+", " ", txt).strip()
    m = _HOURS_RE.search(txt)
    if not m:
        return None
    start = max(0, m.start() - 35)
    return txt[start:m.end() + 70].strip()[:170]


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

    has_fb_pixel = bool(_FB_PIXEL_RE.search(h))
    has_google_ads = bool(_GOOGLE_ADS_RE.search(h))
    has_tiktok_pixel = bool(_TIKTOK_PIXEL_RE.search(h))
    # plataformas onde o lead JA anuncia (pixel de verdade, nao analytics). Lista
    # pronta pra ficha/score. Vazia = nao detectamos anuncio.
    ad_platforms = [
        p for p, on in (("meta", has_fb_pixel), ("google", has_google_ads), ("tiktok", has_tiktok_pixel)) if on
    ]
    return {
        "has_fb_pixel": has_fb_pixel,
        "has_google_ads": has_google_ads,
        "has_tiktok_pixel": has_tiktok_pixel,
        "ad_platforms": ad_platforms,
        "has_google_tag": bool(_GOOGLE_TAG_RE.search(h)),
        "has_chat_widget": chat_vendor is not None,
        "chat_vendor": chat_vendor,
        "has_form": bool(_FORM_RE.search(h)),
        "has_online_booking": bool(_BOOKING_RE.search(h)),
        "has_ecommerce": bool(_ECOMM_RE.search(h)),
        "has_tiktok": bool(_TIKTOK_CH_RE.search(h)),
        "has_youtube": bool(_YOUTUBE_CH_RE.search(h)),
        "has_linkedin": bool(_LINKEDIN_CH_RE.search(h)),
        "has_linktree": bool(_LINKTREE_RE.search(h)),
        "has_marketplace": bool(_MARKETPLACE_RE.search(h)),
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
        pagespeed=None,
    ):
        self._reachable = reachable or http_reachable
        # None = busca real; injetar (ex.: lambda _u: None) deixa offline/deterministico
        self._fetch_html = fetch_html if fetch_html is not None else http_fetch_html
        # extrator LLM opcional (Groq, gratis): reforça o regex quando ele nao
        # acha contato. None = so regex.
        self._llm_extract = llm_extract
        # probe do PageSpeed (Google, gratis) opcional: url -> dict de performance
        # (perf_score, perf_slow, lcp_ms...). Mesclado no site_signals. None = off.
        self._pagespeed = pagespeed

    def enrich(self, lead: Lead) -> list[Finding]:
        site = clean("website", lead.website)
        if not site:
            return []  # sem site: sinal tratado no score, nao aqui

        # O "site" do Maps as vezes e, na verdade, o Instagram/Facebook do
        # negocio. Nao da pra raspar (IG/FB bloqueiam e o HTML vira lixo, era
        # dai que saia o handle "_n"). Extrai o @ certo da propria URL e para.
        low = site.lower()
        if "instagram.com/" in low:
            h = ig_handle_from_url(site)
            return [Finding("instagram", self.name, h, 0.8)] if h else []
        if "facebook.com/" in low or "fb.com/" in low:
            fb = extract_facebook(site)
            return [Finding("facebook", self.name, fb, 0.7)] if fb else []

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
            doc = extract_cnpj(html)
            if doc:
                # destrava o CnpjSource no mesmo passo (website roda antes do cnpj
                # no build_sources): com o CNPJ achado aqui, a cascata busca dono,
                # data de abertura e situacao de graca.
                findings.append(Finding("cnpj", self.name, doc, 0.7))

            # Sinais tecnicos do site (de graca). Viram a coluna site_signals
            # (cascade trata o JSON). Performance real do PageSpeed (Google,
            # gratis) entra aqui quando o probe esta ligado.
            sig = extract_site_signals(html, url=site)
            if self._pagespeed:
                try:
                    perf = self._pagespeed(site)
                except Exception:
                    perf = None
                if perf:
                    sig.update(perf)
            findings.append(Finding("site_signals", self.name, json.dumps(sig), 0.9))
            # horario de atendimento: muito site lista no rodape. Pega uma dica
            # em texto (a IA normaliza depois pra calcular "aberto agora?").
            hint = extract_hours_hint(html)
            if hint:
                findings.append(Finding("opening_hours", self.name, hint, 0.5))
            # "Ja anuncia?": so PIXEL DE ANUNCIO de verdade (Meta/Google Ads/
            # TikTok) deriva ads_active=sim. Analytics (GA/GTM) NAO conta: quase
            # todo site tem medicao e isso geraria falso "ja anuncia".
            if sig.get("ad_platforms"):
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
