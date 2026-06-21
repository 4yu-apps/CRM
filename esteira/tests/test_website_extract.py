"""Testes da raspagem de Instagram + e-mail + WhatsApp + Facebook do site."""
from garimpo_esteira.models import Lead
from garimpo_esteira.sources.website import (
    WebsiteSource,
    extract_email,
    extract_facebook,
    extract_instagram,
    extract_phone,
    extract_whatsapp,
)

_HTML = """
<html><footer>
  <a href="https://instagram.com/clinica.bella">Insta</a>
  <a href="https://www.instagram.com/p/Cxyz123/">um post</a>
  <a href="https://wa.me/5544999998888">WhatsApp</a>
  <a href="https://www.facebook.com/sharer.php?u=x">compartilhe</a>
  <a href="https://facebook.com/clinicabella">Curta nossa pagina</a>
  <a href="tel:+554430251020">Ligue</a>
  Fale com a gente: contato@clinicabella.com.br
  <img src="logo@2x.png">
</footer></html>
"""


def test_extract_instagram_pega_o_perfil_nao_o_post():
    assert extract_instagram(_HTML) == "@clinica.bella"


def test_extract_instagram_vazio_quando_nao_ha():
    assert extract_instagram("<html>nada aqui</html>") is None


def test_extract_email_pega_contato_e_ignora_lixo():
    assert extract_email(_HTML) == "contato@clinicabella.com.br"


def test_extract_whatsapp_do_link_wa_me():
    # wa.me/5544... -> normaliza tirando o 55 do Brasil
    assert extract_whatsapp(_HTML) == "44999998888"


def test_extract_facebook_pega_a_pagina_nao_o_sharer():
    assert extract_facebook(_HTML) == "clinicabella"


def test_extract_phone_do_link_tel():
    assert extract_phone(_HTML) == "4430251020"


def test_extract_whatsapp_vazio_quando_nao_ha():
    assert extract_whatsapp("<html>sem zap</html>") is None


def test_website_source_enriquece_ig_email_whatsapp_facebook(monkeypatch):
    src = WebsiteSource(fetch_html=lambda _u: _HTML)
    lead = Lead(id="1", owner_id="o", website="https://clinicabella.com.br")
    findings = src.enrich(lead)
    campos = {f.field_name: f.value for f in findings}
    assert campos.get("website")
    assert campos.get("instagram") == "@clinica.bella"
    assert campos.get("email") == "contato@clinicabella.com.br"
    assert campos.get("whatsapp") == "44999998888"
    assert campos.get("facebook") == "clinicabella"
    assert campos.get("phone") == "4430251020"


def test_website_source_sem_site_nao_faz_nada():
    src = WebsiteSource(fetch_html=lambda _u: _HTML)
    assert src.enrich(Lead(id="1", owner_id="o", website=None)) == []


def test_website_source_site_que_nao_responde_cai_no_reachable():
    # fetch falha (None) mas o site responde no HEAD -> ao menos confirma o site
    src = WebsiteSource(reachable=lambda _u: True, fetch_html=lambda _u: None)
    findings = src.enrich(Lead(id="1", owner_id="o", website="x.com"))
    assert any(f.field_name == "website" for f in findings)
