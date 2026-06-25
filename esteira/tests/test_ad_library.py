"""Testes da fonte Meta Ad Library — probe por page_id (confiavel)."""
from garimpo_esteira.models import Lead
from garimpo_esteira.sources.ad_library import (
    AdLibrarySource,
    has_active_ads,
    has_ads_info,
    meta_ads_probe,
    resolve_page_id,
)


class FakeResp:
    def __init__(self, status=200, payload=None):
        self.status_code = status
        self._payload = payload or {}

    def json(self):
        return self._payload


def test_resolve_page_id_numerico_usa_direto():
    # ja e id: nem chama o Graph
    assert resolve_page_id("123456", "tok", None, 5) == "123456"


def test_resolve_page_id_slug_resolve_pelo_graph():
    def get(url, params=None, timeout=None):
        assert url.endswith("/clinicabella")
        assert params["fields"] == "id"
        return FakeResp(200, {"id": "999"})

    assert resolve_page_id("clinicabella", "tok", get, 5) == "999"


def test_resolve_page_id_sem_facebook_e_none():
    assert resolve_page_id(None, "tok", None, 5) is None


def test_resolve_page_id_graph_falha_vira_none():
    assert resolve_page_id("x", "tok", lambda *a, **k: FakeResp(400, {}), 5) is None


def test_has_active_ads_true_quando_tem_anuncio():
    def get(url, params=None, timeout=None):
        assert "ads_archive" in url
        assert params["search_page_ids"] == '["999"]'
        return FakeResp(200, {"data": [{"id": "ad1"}]})

    assert has_active_ads("999", "tok", get, "BR", 5) is True


def test_has_active_ads_false_quando_vazio():
    assert has_active_ads("999", "tok", lambda *a, **k: FakeResp(200, {"data": []}), "BR", 5) is False


def test_probe_end_to_end_por_facebook():
    def get(url, params=None, timeout=None):
        if url.endswith("/clinicabella"):
            return FakeResp(200, {"id": "999"})
        return FakeResp(200, {"data": [{"id": "ad1", "ad_delivery_start_time": "2025-01-10"}]})

    probe = meta_ads_probe("tok", get=get)
    lead = Lead(id="1", owner_id="o", business_name="Clinica Bella", facebook="clinicabella")
    r = probe(lead)
    assert r["active"] is True
    assert r["count"] == 1
    assert r["since"] == "2025-01-10"


def test_probe_sem_facebook_e_desconhecido():
    # sem pagina resolvivel -> None (nada de chute por nome, que dava ruido)
    probe = meta_ads_probe("tok", get=lambda *a, **k: FakeResp(200, {"data": []}))
    lead = Lead(id="1", owner_id="o", business_name="Sem Face")
    assert probe(lead) is None


# ------------------------------------------------------------------
# Fase 6: intensidade (quantos anuncios + desde quando)
# ------------------------------------------------------------------

def test_has_ads_info_conta_e_since():
    data = {"data": [
        {"id": "a1", "ad_delivery_start_time": "2025-03-01"},
        {"id": "a2", "ad_delivery_start_time": "2024-11-15"},
        {"id": "a3"},
    ]}
    info = has_ads_info("999", "tok", lambda *a, **k: FakeResp(200, data), "BR", 5)
    assert info == {"active": True, "count": 3, "since": "2024-11-15"}


def test_has_ads_info_vazio():
    info = has_ads_info("999", "tok", lambda *a, **k: FakeResp(200, {"data": []}), "BR", 5)
    assert info == {"active": False, "count": 0, "since": None}


def test_source_emite_intensidade_com_dict():
    src = AdLibrarySource(probe=lambda _l: {"active": True, "count": 7, "since": "2024-10-01"})
    by = {f.field_name: f for f in src.enrich(Lead(id="1", owner_id="o"))}
    assert by["ads_active"].value == "sim"
    assert by["ads_count"].value == "7"
    assert by["ads_since"].value == "2024-10-01"


def test_source_aceita_probe_bool_legado():
    src = AdLibrarySource(probe=lambda _l: True)
    by = {f.field_name: f for f in src.enrich(Lead(id="1", owner_id="o"))}
    assert by["ads_active"].value == "sim"
    assert "ads_count" not in by
