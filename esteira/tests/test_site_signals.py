"""Testes de sinais tecnicos do site (extract_site_signals) e score por profissao."""
from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import score_lead
from garimpo_esteira.sources.website import extract_site_signals, WebsiteSource


# ============================================================================
# 1. Testes de extract_site_signals
# ============================================================================

def test_extract_site_signals_facebook_pixel_init():
    """HTML com fbq('init', '123') detecta has_fb_pixel."""
    html = '<html><script>fbq("init", "123");</script></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_fb_pixel"] is True


def test_extract_site_signals_facebook_pixel_fbevents():
    """HTML com connect.facebook.net/.../fbevents.js detecta has_fb_pixel."""
    html = '<html><script src="https://connect.facebook.net/en_US/fbevents.js"></script></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_fb_pixel"] is True


def test_extract_site_signals_google_tag():
    """HTML com googletagmanager.com/gtag/js detecta has_google_tag."""
    html = '<html><script async src="https://www.googletagmanager.com/gtag/js?id=GA-123"></script></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_google_tag"] is True


def test_extract_site_signals_mobile_ready_with_viewport():
    """HTML com <meta name="viewport"> detecta mobile_ready como True."""
    html = '<html><head><meta name="viewport" content="width=device-width"></head></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["mobile_ready"] is True


def test_extract_site_signals_mobile_ready_without_viewport():
    """HTML sem viewport detecta mobile_ready como False."""
    html = '<html><head><title>Sem viewport</title></head></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["mobile_ready"] is False


def test_extract_site_signals_tawk_chat_widget():
    """HTML com tawk.to detecta has_chat_widget e chat_vendor."""
    html = '<html><script src="https://tawk.to/chat.js"></script></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_chat_widget"] is True
    assert signals["chat_vendor"] == "tawk"


def test_extract_site_signals_has_form():
    """HTML com <form> detecta has_form."""
    html = '<html><body><form><input type="email"></form></body></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_form"] is True


def test_extract_site_signals_wordpress_stack():
    """HTML com wp-content detecta stack == "wordpress"."""
    html = '<html><link rel="stylesheet" href="https://site.com/wp-content/style.css"></html>'
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["stack"] == "wordpress"


def test_extract_site_signals_https_true():
    """url com https:// detecta https como True."""
    html = '<html></html>'
    signals = extract_site_signals(html, url="https://example.com")
    assert signals["https"] is True


def test_extract_site_signals_http_false():
    """url com http:// detecta https como False."""
    html = '<html></html>'
    signals = extract_site_signals(html, url="http://example.com")
    assert signals["https"] is False


def test_extract_site_signals_empty_html():
    """HTML vazio nao quebra e retorna tudo False/None sem erro."""
    html = ""
    signals = extract_site_signals(html, url="https://x.com")
    assert signals["has_fb_pixel"] is False
    assert signals["has_google_tag"] is False
    assert signals["mobile_ready"] is False
    assert signals["has_chat_widget"] is False
    assert signals["chat_vendor"] is None
    assert signals["has_form"] is False
    assert signals["stack"] is None
    assert signals["https"] is True


def test_extract_site_signals_returns_dict_with_all_keys():
    """extract_site_signals retorna dict com todas as chaves esperadas."""
    html = '<html></html>'
    signals = extract_site_signals(html, url="https://x.com")
    expected_keys = {
        "has_fb_pixel", "has_google_ads", "has_tiktok_pixel", "ad_platforms",
        "has_google_tag", "has_chat_widget", "chat_vendor",
        "has_form", "has_online_booking", "has_ecommerce",
        "has_tiktok", "has_youtube", "has_linkedin",
        "mobile_ready", "page_kb", "slow", "stack",
        "https", "has_h1", "has_title", "has_description", "og_image"
    }
    assert set(signals.keys()) == expected_keys


# --- anuncio pago vs analytics (precisao do "ja anuncia?") ------------------

def test_extract_site_signals_google_ads_conversion():
    """Tag de conversao do Google Ads detecta has_google_ads e entra em ad_platforms."""
    html = '<html><script src="https://www.googleadservices.com/pagead/conversion.js"></script></html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_google_ads"] is True
    assert "google" in s["ad_platforms"]


def test_extract_site_signals_analytics_is_not_ads():
    """Google Analytics/GTM puro NAO e anuncio (so medicao)."""
    html = '<html><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC123"></script></html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_google_tag"] is True
    assert s["has_google_ads"] is False
    assert s["ad_platforms"] == []


def test_extract_site_signals_tiktok_pixel():
    html = '<html><script>ttq.load("ABCDEF");</script></html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_tiktok_pixel"] is True
    assert "tiktok" in s["ad_platforms"]


def test_extract_site_signals_ad_platforms_meta_only():
    html = '<html>fbq("init", "1")</html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["ad_platforms"] == ["meta"]


# --- canais extras + agendamento + e-commerce ------------------------------

def test_extract_site_signals_extra_channels():
    html = (
        '<html>'
        '<a href="https://www.tiktok.com/@negocio">tt</a>'
        '<a href="https://youtube.com/@negocio">yt</a>'
        '<a href="https://www.linkedin.com/company/negocio">li</a>'
        '</html>'
    )
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_tiktok"] is True
    assert s["has_youtube"] is True
    assert s["has_linkedin"] is True


def test_extract_site_signals_online_booking():
    html = '<html><a href="https://calendly.com/negocio">Agende</a></html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_online_booking"] is True


def test_extract_site_signals_ecommerce():
    html = '<html><script src="https://cdn.shopify.com/x.js"></script><a href="/checkout">Finalizar compra</a></html>'
    s = extract_site_signals(html, url="https://x.com")
    assert s["has_ecommerce"] is True


# ============================================================================
# 2. Testes de score_lead com profissao (lens)
# ============================================================================

def _lead(**kw) -> Lead:
    """Helper para criar lead com defaults realistas."""
    base = dict(id="l", owner_id="o", phone="11999999999", rating=4.6, reviews_count=120)
    base.update(kw)
    return Lead(**base)


def test_score_lead_design_without_website():
    """Design sem site: decision qualificado, lens design, sem website pontua alto."""
    lead = _lead(website=None)
    r = score_lead(lead, profession="design")
    assert r.decision == "qualificado"
    assert r.reason["lens"] == "design"
    # design sem site e com nota/volume deve qualificar
    assert r.score >= 50


def test_score_lead_marketing_profession():
    """Marketing: reason["lens"] == "marketing"."""
    lead = _lead(website=None)
    r = score_lead(lead, profession="marketing")
    assert r.reason["lens"] == "marketing"


def test_score_lead_trafego_profession():
    """Trafego: reason["lens"] == "trafego"."""
    lead = _lead(website=None)
    r = score_lead(lead, profession="trafego")
    assert r.reason["lens"] == "trafego"


def test_score_lead_automacao_profession():
    """Automacao: reason["lens"] == "automacao"."""
    lead = _lead(website=None)
    r = score_lead(lead, profession="automacao")
    assert r.reason["lens"] == "automacao"


def test_score_lead_none_profession_default_ambos():
    """#2: profession=None oferta trafego+automacao; sem anuncio conhecido a
    maioria dos leads serve pros dois => alvo/lente "ambos"."""
    lead = _lead(website=None)
    r = score_lead(lead, profession=None)
    assert r.reason["lens"] == "ambos"
    assert r.service_target == "ambos"


def test_score_lead_with_signals_and_trafego_profession():
    """Passar signals com trafego profession nao quebra."""
    lead = _lead(website="example.com")
    signals = {"site": {"has_fb_pixel": True}}
    r = score_lead(lead, signals=signals, profession="trafego")
    assert r.reason["lens"] == "trafego"
    # trafego com pixel aquecido deve qualificar
    assert r.decision == "qualificado"


def test_trafego_analytics_only_nao_conta_como_anuncia():
    """So GA/GTM (analytics) NAO marca 'ja anuncia': vale a oportunidade (15)."""
    lead = _lead(website="example.com")
    so_analytics = score_lead(lead, signals={"site": {"has_google_tag": True}}, profession="trafego")
    anuncia = next(c for c in so_analytics.reason["trafego"]["criteria"] if c["label"] == "Anuncia?")
    # sem pixel de anuncio e ads desconhecido => 8 (desconhecido), nunca 6 (aquecido)
    assert anuncia["points"] == 8


def test_score_design_usa_pagespeed_perf():
    """Lente design usa perf_score do PageSpeed: nota baixa vira criterio Performance."""
    lead = _lead(website="https://x.com")
    signals = {"site": {"perf_score": 20, "mobile_ready": True}}
    r = score_lead(lead, signals=signals, profession="design")
    labels = [c["label"] for c in r.reason["design"]["criteria"]]
    assert "Performance" in labels


# ============================================================================
# 3. Testes de WebsiteSource emitindo findings
# ============================================================================

def test_website_source_emits_site_signals_finding():
    """WebsiteSource emite Finding com field_name='site_signals' (JSON string)."""
    html = '<html>fbq("init")<meta name="viewport" content="width=device-width"></html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    lead = _lead(website="x.com")
    findings = src.enrich(lead)

    signals_findings = [f for f in findings if f.field_name == "site_signals"]
    assert len(signals_findings) == 1

    # value é JSON string
    import json
    sig_dict = json.loads(signals_findings[0].value)
    assert sig_dict["has_fb_pixel"] is True
    assert sig_dict["mobile_ready"] is True


def test_website_source_emits_ads_active_when_pixel():
    """WebsiteSource emite Finding ads_active='sim' quando acha pixel."""
    html = '<html>fbq("init")</html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    lead = _lead(website="x.com")
    findings = src.enrich(lead)

    ads_findings = [f for f in findings if f.field_name == "ads_active"]
    assert len(ads_findings) == 1
    assert ads_findings[0].value == "sim"


def test_website_source_no_ads_active_for_analytics_only():
    """Google Analytics/GTM puro NAO e anuncio: WebsiteSource nao emite ads_active."""
    html = '<html><script src="https://www.googletagmanager.com/gtag/js?id=G-ABC"></script></html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    lead = _lead(website="x.com")
    findings = src.enrich(lead)

    ads_findings = [f for f in findings if f.field_name == "ads_active"]
    assert len(ads_findings) == 0


def test_website_source_emits_ads_active_when_google_ads_tag():
    """Tag de conversao do Google Ads (AW-/googleadservices) emite ads_active='sim'."""
    html = '<html><script>gtag("config", "AW-123456789");</script></html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    findings = src.enrich(_lead(website="x.com"))

    ads_findings = [f for f in findings if f.field_name == "ads_active"]
    assert len(ads_findings) == 1
    assert ads_findings[0].value == "sim"


def test_website_source_emits_ads_active_when_tiktok_pixel():
    """TikTok pixel (ttq.load) emite ads_active='sim'."""
    html = '<html><script>ttq.load("ABC123");</script></html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    findings = src.enrich(_lead(website="x.com"))

    ads_findings = [f for f in findings if f.field_name == "ads_active"]
    assert len(ads_findings) == 1
    assert ads_findings[0].value == "sim"


def test_website_source_no_ads_active_without_pixel():
    """WebsiteSource NAO emite ads_active quando nao ha pixel/tag."""
    html = '<html><p>Sem pixel</p></html>'
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    lead = _lead(website="x.com")
    findings = src.enrich(lead)

    ads_findings = [f for f in findings if f.field_name == "ads_active"]
    assert len(ads_findings) == 0


def test_website_source_site_signals_complete_check():
    """WebsiteSource emite site_signals completo com multiplos sinais."""
    html = '''<html>
        <head>
            <meta name="viewport" content="width=device-width">
            <title>Site</title>
            <meta name="description" content="Desc">
        </head>
        <body>
            <h1>Titulo</h1>
            <form><input type="email"></form>
            <script src="https://tawk.to/chat.js"></script>
            fbq("init", "123");
        </body>
    </html>'''
    src = WebsiteSource(fetch_html=lambda _u: html, reachable=lambda _u: True)
    lead = _lead(website="https://example.com")
    findings = src.enrich(lead)

    signals_findings = [f for f in findings if f.field_name == "site_signals"]
    assert len(signals_findings) == 1

    import json
    sig = json.loads(signals_findings[0].value)
    assert sig["mobile_ready"] is True
    assert sig["has_title"] is True
    assert sig["has_description"] is True
    assert sig["has_h1"] is True
    assert sig["has_form"] is True
    assert sig["has_chat_widget"] is True
    assert sig["chat_vendor"] == "tawk"
    assert sig["has_fb_pixel"] is True
    assert sig["https"] is True
