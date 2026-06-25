import json
from datetime import date

from garimpo_esteira.models import Lead
from garimpo_esteira.sources import biz_signals as bz


def _lead(**fields) -> Lead:
    return Lead(id="1", owner_id="o", **fields)


def test_phone_type_celular_e_fixo():
    assert bz.phone_type("11999990000") == "celular"
    assert bz.phone_type("1133334444") == "fixo"
    assert bz.phone_type(None) is None
    assert bz.phone_type("123") is None


def test_domain_from_usa_website_depois_email():
    assert bz.domain_from(_lead(website="https://www.Salao.com.br/ag")) == "salao.com.br"
    assert bz.domain_from(_lead(email="contato@clinica.com.br")) == "clinica.com.br"
    assert bz.domain_from(_lead()) is None


def test_domain_from_rejeita_ip_e_hosts_locais():
    assert bz.domain_from(_lead(website="http://127.0.0.1/admin")) is None
    assert bz.domain_from(_lead(website="http://metadata.internal")) is None
    assert bz.domain_from(_lead(email="x@localhost")) is None


def test_email_provider_mapeia_mx(monkeypatch):
    monkeypatch.setattr(bz, "_resolve_mx", lambda _d: ["aspmx.l.google.com"])
    assert bz.email_provider("x.com") == "google_workspace"
    monkeypatch.setattr(bz, "_resolve_mx", lambda _d: ["x.mail.protection.outlook.com"])
    assert bz.email_provider("x.com") == "microsoft365"
    monkeypatch.setattr(bz, "_resolve_mx", lambda _d: [])
    assert bz.email_provider("x.com") is None


def test_email_provider_nao_chama_gmail_de_workspace(monkeypatch):
    monkeypatch.setattr(
        bz, "_resolve_mx",
        lambda _d: (_ for _ in ()).throw(AssertionError("nao deve consultar")),
    )
    assert bz.email_provider("gmail.com") == "gratuito"


def test_age_days_deterministico():
    assert bz._age_days("2025-01-01T00:00:00Z", today=date(2026, 1, 1)) == 365
    assert bz._age_days("invalida", today=date(2026, 1, 1)) is None


def test_enrich_devolve_site_signals(monkeypatch):
    monkeypatch.setattr(bz, "_resolve_mx", lambda _d: ["aspmx.l.google.com"])
    monkeypatch.setattr(bz, "_rdap_created", lambda _d: "2020-01-01T00:00:00Z")
    lead = _lead(
        phone="11999990000",
        website="https://clinica.com.br",
        email="c@clinica.com.br",
    )
    findings = bz.BizSignalsSource().enrich(lead)
    assert len(findings) == 1
    signals = json.loads(findings[0].value)
    assert signals["phone_type"] == "celular"
    assert signals["email_provider"] == "google_workspace"
    assert signals["domain_created"] == "2020-01-01T00:00:00Z"
    assert signals["domain_age_days"] > 0
    assert findings[0].field_name == "site_signals"
    assert findings[0].source == "biz_signals"


def test_enrich_sem_sinal_retorna_vazio(monkeypatch):
    monkeypatch.setattr(bz, "_rdap_created", lambda _d: None)
    assert bz.BizSignalsSource().enrich(_lead()) == []
