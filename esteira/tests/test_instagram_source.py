"""Testes da fonte Instagram — normalizacao + Business Discovery probe."""
from datetime import datetime, timezone

import pytest

from garimpo_esteira.models import Lead
from garimpo_esteira.sources.instagram import (
    InstagramSource,
    business_discovery_probe,
    instagram_status,
    post_frequency,
)

NOW = datetime(2026, 6, 22, tzinfo=timezone.utc)


class FakeResp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload or {}

    def json(self):
        return self._payload


def _lead(**kw):
    base = dict(id="l", owner_id="o")
    base.update(kw)
    return Lead(**base)


# ------------------------------------------------------------------
# instagram_status
# ------------------------------------------------------------------

def test_status_post_recente_retorna_ativo():
    # post de 10 dias atras: ativo
    assert instagram_status("2026-06-12T10:00:00+0000", now=NOW) == "ativo"


def test_status_post_antigo_retorna_parado():
    # post de 90 dias atras (> stale_days=60): parado
    assert instagram_status("2026-03-23T10:00:00+0000", now=NOW) == "parado"


def test_status_none_retorna_none():
    assert instagram_status(None, now=NOW) is None


def test_status_string_invalida_retorna_none():
    assert instagram_status("nao-e-data", now=NOW) is None


def test_status_respeita_stale_days_custom():
    # com stale_days=7, post de 10 dias atras vira parado
    assert instagram_status("2026-06-12T10:00:00+0000", now=NOW, stale_days=7) == "parado"


def test_status_now_injetado():
    # muda o 'now' pra fazer um post "antigo" parecer recente
    now_fake = datetime(2024, 3, 20, tzinfo=timezone.utc)
    assert instagram_status("2024-03-15T12:00:00+0000", now=now_fake) == "ativo"


def test_status_exatamente_no_limite_e_parado():
    # > stale_days, nao >=. Com 60 dias exatos e "ativo"; 61 e "parado".
    post_60 = "2026-04-23T00:00:00+0000"  # exatos 60 dias antes de 2026-06-22
    post_61 = "2026-04-22T00:00:00+0000"  # 61 dias antes
    assert instagram_status(post_60, now=NOW) == "ativo"
    assert instagram_status(post_61, now=NOW) == "parado"


def test_frequencia_semanal_com_12_posts():
    posts = [
        f"2026-06-{day:02d}T10:00:00+0000"
        for day in (21, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1)
    ] + ["2026-05-30T10:00:00+0000"]
    freq, label = post_frequency(posts, now=NOW)
    assert freq is not None and 3.0 < freq < 4.0
    assert label == "≈4x/semana"


def test_frequencia_mensal():
    freq, label = post_frequency([
        "2026-06-10T10:00:00+0000",
        "2026-05-10T10:00:00+0000",
        "2026-04-10T10:00:00+0000",
    ], now=NOW)
    assert freq is not None and freq < 0.5
    assert label == "≈1x/mês"


def test_frequencia_parada_prioriza_recencia_no_label():
    freq, label = post_frequency([
        "2026-03-20T10:00:00+0000",
        "2026-03-13T10:00:00+0000",
        "2026-03-06T10:00:00+0000",
    ], now=NOW)
    assert freq == 1.0
    assert label == "parado há ~3 meses"


# ------------------------------------------------------------------
# business_discovery_probe
# ------------------------------------------------------------------

def _make_bd_payload(followers=1500, media_count=42, timestamp="2026-06-10T10:00:00+0000"):
    return {
        "business_discovery": {
            "followers_count": followers,
            "media_count": media_count,
            "media": {"data": [{"timestamp": timestamp}]},
        }
    }


def test_probe_monta_campo_e_parseia_resultado():
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append((url, params))
        return FakeResp(200, _make_bd_payload())

    probe = business_discovery_probe("123", "tok", get=fake_get)
    result = probe("clinicabella")

    assert result is not None
    assert result["followers"] == 1500
    assert result["media_count"] == 42
    assert result["last_post"] == "2026-06-10T10:00:00+0000"
    # verifica que o campo monta o username certo
    field_param = calls[0][1]["fields"]
    assert "clinicabella" in field_param
    assert "followers_count" in field_param
    assert "timestamp" in field_param
    assert "media.limit(12)" in field_param


def test_probe_tira_arroba_do_handle():
    # normalize_instagram devolve "@handle"; a API quer o username cru, sem @
    calls = []

    def fake_get(url, params=None, timeout=None):
        calls.append((url, params))
        return FakeResp(200, _make_bd_payload())

    probe = business_discovery_probe("123", "tok", get=fake_get)
    probe("@clinicabella")
    assert "username(clinicabella)" in calls[0][1]["fields"]
    assert "@" not in calls[0][1]["fields"]


def test_probe_sem_business_discovery_retorna_none():
    def fake_get(url, params=None, timeout=None):
        return FakeResp(200, {"id": "123"})  # sem business_discovery

    probe = business_discovery_probe("123", "tok", get=fake_get)
    assert probe("handle") is None


def test_probe_status_nao_200_retorna_none():
    probe = business_discovery_probe("123", "tok", get=lambda *a, **k: FakeResp(400))
    assert probe("handle") is None


def test_probe_excecao_retorna_none():
    def fake_get(*a, **k):
        raise RuntimeError("timeout")

    probe = business_discovery_probe("123", "tok", get=fake_get)
    assert probe("handle") is None


def test_probe_sem_midia_retorna_last_post_none():
    payload = {
        "business_discovery": {
            "followers_count": 100,
            "media_count": 0,
            "media": {"data": []},
        }
    }
    probe = business_discovery_probe("123", "tok", get=lambda *a, **k: FakeResp(200, payload))
    result = probe("handle")
    assert result is not None
    assert result["last_post"] is None


# ------------------------------------------------------------------
# InstagramSource sem probe
# ------------------------------------------------------------------

def test_source_sem_probe_normaliza_handle():
    src = InstagramSource()
    findings = src.enrich(_lead(instagram="@MinhaConta"))
    assert len(findings) == 1
    assert findings[0].field_name == "instagram"
    assert findings[0].value == "@MinhaConta"  # normalize_instagram mantem o @


def test_source_sem_probe_sem_instagram_retorna_lista_vazia():
    src = InstagramSource()
    assert src.enrich(_lead()) == []


def test_source_sem_probe_instagram_vazio_retorna_lista_vazia():
    src = InstagramSource()
    assert src.enrich(_lead(instagram="")) == []


# ------------------------------------------------------------------
# InstagramSource com probe
# ------------------------------------------------------------------

def _fake_probe_com_dados(handle):
    return {
        "followers": 1200,
        "media_count": 35,
        "last_post": "2026-06-12T10:00:00+0000",
    }


def test_source_com_probe_emite_todos_os_findings():
    src = InstagramSource(probe=_fake_probe_com_dados, now=NOW)
    findings = src.enrich(_lead(instagram="clinica"))
    field_names = {f.field_name for f in findings}
    assert "instagram" in field_names
    assert "instagram_followers" in field_names
    assert "instagram_media_count" in field_names
    assert "instagram_status" in field_names
    assert "instagram_last_post" in field_names


def test_source_com_probe_valores_corretos():
    src = InstagramSource(probe=_fake_probe_com_dados, now=NOW)
    findings = src.enrich(_lead(instagram="clinica"))
    by_field = {f.field_name: f for f in findings}
    assert by_field["instagram_followers"].value == "1200"
    assert by_field["instagram_media_count"].value == "35"
    assert by_field["instagram_status"].value == "ativo"


def test_source_com_probe_retornando_none_so_normaliza():
    src = InstagramSource(probe=lambda h: None, now=NOW)
    findings = src.enrich(_lead(instagram="clinica"))
    assert len(findings) == 1
    assert findings[0].field_name == "instagram"


def test_source_com_probe_sem_instagram_retorna_vazio():
    src = InstagramSource(probe=_fake_probe_com_dados, now=NOW)
    assert src.enrich(_lead()) == []


def test_source_com_probe_status_parado_quando_post_antigo():
    def probe_antigo(handle):
        return {
            "followers": 500,
            "media_count": 10,
            "last_post": "2026-01-01T10:00:00+0000",  # > 60 dias antes de 22/06
        }

    src = InstagramSource(probe=probe_antigo, now=NOW)
    findings = src.enrich(_lead(instagram="loja"))
    by_field = {f.field_name: f for f in findings}
    assert by_field["instagram_status"].value == "parado"


def test_source_source_name():
    assert InstagramSource.name == "instagram"


# ------------------------------------------------------------------
# B6: probe captura website + engajamento; source emite website (enriquecivel)
# ------------------------------------------------------------------

def test_probe_captura_website_e_engajamento():
    payload = {"business_discovery": {
        "followers_count": 1000, "media_count": 50, "website": "https://sitedonegocio.com",
        "biography": "Melhor barbearia",
        "media": {"data": [
            {"timestamp": "2026-06-10T10:00:00+0000", "like_count": 80, "comments_count": 20},
            {"timestamp": "2026-06-05T10:00:00+0000", "like_count": 40, "comments_count": 10},
        ]},
    }}
    probe = business_discovery_probe("123", "tok", get=lambda *a, **k: FakeResp(200, payload))
    r = probe("negocio")
    assert r["website"] == "https://sitedonegocio.com"
    assert r["engagement"] == 75.0  # (100 + 50) / 2
    assert r["last_post"] == "2026-06-10T10:00:00+0000"


def test_source_emite_website_e_engajamento():
    def probe(h):
        return {"followers": 1000, "media_count": 50, "last_post": None,
                "website": "https://x.com", "engagement": 30.0}

    src = InstagramSource(probe=probe, now=NOW)
    by = {f.field_name: f for f in src.enrich(_lead(instagram="@x"))}
    assert by["website"].value == "https://x.com"
    assert by["website"].source == "instagram"
    assert by["instagram_engagement"].value == "30.0"


def test_source_sem_website_no_probe_nao_emite_website():
    def probe(h):
        return {"followers": 10, "media_count": 2, "last_post": None}

    src = InstagramSource(probe=probe, now=NOW)
    by = {f.field_name for f in src.enrich(_lead(instagram="@x"))}
    assert "website" not in by
