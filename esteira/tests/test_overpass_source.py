import json

from garimpo_esteira.discovery import discover
from garimpo_esteira.sink import JsonFileSink
from garimpo_esteira.sources.overpass import (
    OverpassSource,
    build_query,
    element_to_raw,
    osm_filters_for,
    parse_term,
)


# ------------------------------------------------------------------
# parsing do termo "nicho em [bairro,] cidade, UF"
# ------------------------------------------------------------------

def test_parse_term_niche_e_cidade():
    assert parse_term("barbearia em Maringá, PR") == ("barbearia", "Maringá")


def test_parse_term_com_bairro_usa_a_cidade():
    assert parse_term("barbearia em Zona 7, Maringá, PR") == ("barbearia", "Maringá")


def test_parse_term_cidade_sem_uf():
    assert parse_term("loja em Maringá") == ("loja", "Maringá")


def test_parse_term_sem_local():
    assert parse_term("pizzaria") == ("pizzaria", None)


# ------------------------------------------------------------------
# nicho -> tags OSM (com fallback por nome quando desconhecido)
# ------------------------------------------------------------------

def test_osm_filters_conhecidos():
    assert ("shop", "hairdresser") in osm_filters_for("barbearia")
    assert ("amenity", "dentist") in osm_filters_for("dentista")
    assert ("amenity", "restaurant") in osm_filters_for("restaurante")


def test_osm_filters_desconhecido_vazio():
    assert osm_filters_for("xpto coisa rara") == []


# ------------------------------------------------------------------
# montagem da query Overpass QL
# ------------------------------------------------------------------

def test_build_query_usa_area_e_tags():
    q = build_query("barbearia", "Maringá")
    assert 'area["name"="Maringá"]' in q
    assert "hairdresser" in q
    assert "out center" in q


def test_build_query_desconhecido_busca_por_nome():
    q = build_query("xpto coisa rara", "Maringá")
    assert '"name"~"xpto coisa rara",i' in q


# ------------------------------------------------------------------
# elemento OSM -> raw dict no contrato da descoberta
# ------------------------------------------------------------------

def test_element_to_raw_node_completo():
    el = {
        "type": "node", "id": 123, "lat": -23.4, "lon": -51.9,
        "tags": {
            "name": "Barbearia Z", "contact:phone": "(44) 99888-2000",
            "website": "https://z.com", "shop": "hairdresser",
            "addr:street": "Rua A", "addr:housenumber": "100",
            "addr:suburb": "Zona 7", "addr:city": "Maringá",
            "addr:state": "PR", "addr:country": "BR",
        },
    }
    raw = element_to_raw(el)
    assert raw["name"] == "Barbearia Z"
    assert raw["phone"] == "(44) 99888-2000"
    assert raw["website"] == "https://z.com"
    assert raw["neighborhood"] == "Zona 7"
    assert raw["city"] == "Maringá"
    assert raw["state"] == "PR"
    assert raw["country"] == "BR"
    assert raw["lat"] == -23.4 and raw["lng"] == -51.9
    assert raw["place_id"] == "osm:node/123"
    assert "Rua A" in raw["address"] and "100" in raw["address"]


def test_element_to_raw_way_usa_center():
    el = {"type": "way", "id": 9, "center": {"lat": -23.0, "lon": -51.0},
          "tags": {"name": "Salão Y", "shop": "beauty"}}
    raw = element_to_raw(el)
    assert raw["lat"] == -23.0 and raw["lng"] == -51.0
    assert raw["place_id"] == "osm:way/9"


def test_element_to_raw_phone_simples():
    el = {"type": "node", "id": 5, "lat": -23.0, "lon": -51.0,
          "tags": {"name": "Pet X", "phone": "44 3333-0000", "shop": "pet"}}
    assert element_to_raw(el)["phone"] == "44 3333-0000"


def test_element_to_raw_sem_nome_e_none():
    assert element_to_raw({"type": "node", "id": 1, "tags": {"shop": "hairdresser"}}) is None


# ------------------------------------------------------------------
# OverpassSource (MapsSource): search() com fetch injetado, sem rede
# ------------------------------------------------------------------

def test_overpass_source_search_parseia_elements():
    payload = {"elements": [
        {"type": "node", "id": 1, "lat": -23.4, "lon": -51.9,
         "tags": {"name": "Barbearia Z", "shop": "hairdresser", "addr:city": "Maringá"}},
        {"type": "node", "id": 2, "lat": -23.5, "lon": -51.8,
         "tags": {"shop": "hairdresser"}},  # sem nome: ignorado
    ]}
    src = OverpassSource(fetch=lambda q: payload)
    out = src.search("barbearia em Maringá, PR")
    assert len(out) == 1
    assert out[0]["name"] == "Barbearia Z"
    assert src.provenance_source == "openstreetmap"


def test_overpass_source_sem_area_nao_chama_api():
    called = {"n": 0}

    def fetch(q):
        called["n"] += 1
        return {"elements": []}

    src = OverpassSource(fetch=fetch)
    assert src.search("pizzaria") == []  # sem cidade no termo, nao varre o planeta
    assert called["n"] == 0


# ------------------------------------------------------------------
# integra com discover(): grava proveniencia openstreetmap, nao google_maps
# ------------------------------------------------------------------

def test_discover_overpass_grava_proveniencia_osm(tmp_path):
    payload = {"elements": [
        {"type": "node", "id": 1, "lat": -23.4, "lon": -51.9, "tags": {
            "name": "Barbearia Z", "shop": "hairdresser",
            "contact:phone": "(44) 99888-2000", "addr:city": "Maringá", "addr:state": "PR",
        }},
    ]}
    sink = JsonFileSink(tmp_path / "db.json")
    res = discover(sink, OverpassSource(fetch=lambda q: payload), ["barbearia em Maringá, PR"], "owner")
    assert res["inserted"] == 1
    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert any(p["source"] == "openstreetmap" for p in db["provenance"])
    assert all(p["source"] != "google_maps" for p in db["provenance"])
