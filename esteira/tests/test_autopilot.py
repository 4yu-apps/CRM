"""Testes do autopilot multi-tenant e da localizacao (estado + cidade).

Cobre:
- search_term inclui cidade + estado (sem ambiguidade)
- region_key desambigua cidades de mesmo nome em estados diferentes
- paginacao do PlacesMapsSource (acumula paginas, para no token vazio)
- autopilot descobre e roda o pipeline escopado ao dono
- autopilot pula zona+nicho ja varridos (memoria de cobertura)
- autopilot isola os donos (multi-tenant) e ignora perfis sem autopilot
- fetch_by_status filtra por dono
"""
import pytest
from garimpo_esteira.autopilot import (
    generate_terms,
    region_key,
    run_autopilot,
    search_term,
)
from garimpo_esteira.discovery import PlacesMapsSource
from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


# ---- helpers ----

class FakeMaps:
    """Fonte de Maps falsa: registra as buscas e devolve resultados fixos."""

    def __init__(self, results):
        self._results = results
        self.terms: list[str] = []

    def search(self, term: str) -> list[dict]:
        self.terms.append(term)
        return [dict(r) for r in self._results]


def _two_results():
    return [
        {"name": "Estetica Bela", "formatted_phone_number": "44999990001",
         "rating": 4.7, "user_ratings_total": 210, "place_id": "p1"},
        {"name": "Studio Glow", "formatted_phone_number": "44999990002",
         "rating": 4.5, "user_ratings_total": 130, "place_id": "p2"},
    ]


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


# ---- localizacao: termo e regiao ----

def test_search_term_inclui_cidade_e_estado():
    t = search_term("estetica", "Maringa", "PR")
    assert "estetica" in t
    assert "Maringa" in t
    assert "PR" in t


def test_search_term_sem_cidade_usa_so_o_nicho():
    assert search_term("estetica", None, None) == "estetica"


def test_region_key_desambigua_estados():
    # mesma cidade, estados diferentes -> chaves diferentes (sem ambiguidade)
    assert region_key("Bom Jardim", "PR") != region_key("Bom Jardim", "RJ")


def test_region_key_estavel_e_normalizada():
    assert region_key("Maringá", "PR") == region_key("maringa", "pr")


def test_generate_terms_um_por_nicho():
    pares = generate_terms(["estetica", "barbearia"], "Maringa", "PR")
    assert [n for n, _ in pares] == ["estetica", "barbearia"]
    assert all("Maringa" in termo for _, termo in pares)


# ---- paginacao do Places ----

def test_places_pagination_acumula_e_para(monkeypatch):
    src = PlacesMapsSource("chave-fake", max_pages=5)
    pages = [
        ([{"displayName": {"text": "A"}, "id": "a"}], "tok1"),
        ([{"displayName": {"text": "B"}, "id": "b"}], "tok2"),
        ([{"displayName": {"text": "C"}, "id": "c"}], None),
    ]
    tokens_vistos = []

    def fake_fetch(term, token):
        tokens_vistos.append(token)
        return pages.pop(0)

    monkeypatch.setattr(src, "_fetch_page", fake_fetch)
    out = src.search("estetica em Maringa")
    assert [r["name"] for r in out] == ["A", "B", "C"]
    assert tokens_vistos == [None, "tok1", "tok2"]  # parou quando o token veio vazio


def test_places_pagination_respeita_max_pages(monkeypatch):
    src = PlacesMapsSource("chave-fake", max_pages=2)

    def fake_fetch(term, token):
        return [{"displayName": {"text": "X"}, "id": "x"}], "sempre-tem-mais"

    monkeypatch.setattr(src, "_fetch_page", fake_fetch)
    out = src.search("x")
    assert len(out) == 2  # parou no teto de paginas, mesmo com token


# ---- autopilot ----

def test_autopilot_descobre_e_roda_pipeline(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_profile(
        "owner-1", niches=["estetica"], city="Maringa", state="PR", autopilot=True
    )
    maps = FakeMaps(_two_results())

    summary = run_autopilot(sink, maps, MockDraftProvider(), [], batch=20)

    assert summary == [{"owner_id": "owner-1", "discovered": 2}]
    # os 2 leads entraram sob o dono e sairam de 'bruto' (pipeline rodou)
    owned = [r for r in sink._db["leads"].values() if r["owner_id"] == "owner-1"]
    assert len(owned) == 2
    assert all(r["status"] != "bruto" for r in owned)
    assert all(r.get("score") is not None for r in owned)
    # cobertura e atividade gravadas
    assert any(c["region_key"] == region_key("Maringa", "PR") for c in sink._db["coverage"])
    assert any(a["tipo"] == "busca" for a in sink._db.get("activity", []))


def test_autopilot_pula_zona_ja_varrida(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_profile(
        "owner-1", niches=["estetica"], city="Maringa", state="PR", autopilot=True
    )
    # ja varremos estetica nessa regiao antes
    sink.upsert_coverage("owner-1", region_key("Maringa", "PR"), "estetica", result_count=5)
    maps = FakeMaps(_two_results())

    summary = run_autopilot(sink, maps, MockDraftProvider(), [], batch=20)

    assert maps.terms == []  # nao buscou de novo
    assert summary == [{"owner_id": "owner-1", "discovered": 0}]


def test_autopilot_isola_donos(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_profile("owner-a", niches=["estetica"], city="Maringa", state="PR", autopilot=True)
    sink.upsert_profile("owner-b", niches=["barbearia"], city="Curitiba", state="PR", autopilot=True)
    maps = FakeMaps(_two_results())

    run_autopilot(sink, maps, MockDraftProvider(), [], batch=20)

    a = [r for r in sink._db["leads"].values() if r["owner_id"] == "owner-a"]
    b = [r for r in sink._db["leads"].values() if r["owner_id"] == "owner-b"]
    assert len(a) == 2 and len(b) == 2
    # leads de cada dono ficam sob o owner certo (sem vazamento)
    assert all(r["owner_id"] == "owner-a" for r in a)


def test_autopilot_ignora_perfil_sem_autopilot(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_profile("owner-1", niches=["estetica"], city="Maringa", state="PR", autopilot=False)
    maps = FakeMaps(_two_results())

    summary = run_autopilot(sink, maps, MockDraftProvider(), [], batch=20)

    assert summary == []
    assert maps.terms == []


# ---- filtro de dono no fetch_by_status ----

def test_fetch_by_status_filtra_por_dono(tmp_path):
    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="owner-a", status="bruto", business_name="A", phone="44900000001"))
    sink.insert_lead(Lead(id="", owner_id="owner-b", status="bruto", business_name="B", phone="44900000002"))

    todos = sink.fetch_by_status("bruto", 20)
    so_a = sink.fetch_by_status("bruto", 20, owner_id="owner-a")
    assert len(todos) == 2
    assert len(so_a) == 1 and so_a[0].owner_id == "owner-a"


def test_autopilot_nichos_extras_aleatorios(tmp_path):
    import random
    sink = _sink(tmp_path)
    sink.upsert_profile("o", niches=["estetica"], city="Maringa", state="PR", autopilot=True)
    maps = FakeMaps(_two_results())
    run_autopilot(sink, maps, MockDraftProvider(), [], batch=20,
                  extra_niches=2, rng=random.Random(1))
    # nicho do perfil + 2 extras = 3 buscas, todas diferentes
    assert len(maps.terms) == 3
    assert len(set(maps.terms)) == 3
    assert any("estetica" in t.lower() for t in maps.terms)


def test_autopilot_sem_extras_so_o_perfil(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_profile("o", niches=["estetica", "barbearia"], city="Maringa", state="PR", autopilot=True)
    maps = FakeMaps(_two_results())
    run_autopilot(sink, maps, MockDraftProvider(), [], batch=20, extra_niches=0)
    assert len(maps.terms) == 2  # so os 2 do perfil


def test_autopilot_grava_coordenadas_no_coverage(tmp_path):
    """Quando os resultados do Maps trazem lat/lng, coverage deve ter center_lat/lng e pct > 0."""
    sink = _sink(tmp_path)
    sink.upsert_profile("owner-1", niches=["estetica"], city="Maringa", state="PR", autopilot=True)

    results_com_coords = [
        {"name": "Estetica A", "formatted_phone_number": "44999990001",
         "place_id": "p1", "lat": -23.42, "lng": -51.93},
        {"name": "Estetica B", "formatted_phone_number": "44999990002",
         "place_id": "p2", "lat": -23.44, "lng": -51.95},
    ]

    class FakeMapsCoords:
        def search(self, term):
            return [dict(r) for r in results_com_coords]

    run_autopilot(sink, FakeMapsCoords(), MockDraftProvider(), [], batch=20)

    cov = [c for c in sink._db["coverage"] if c["owner_id"] == "owner-1"]
    assert len(cov) == 1
    rec = cov[0]
    assert rec["center_lat"] == pytest.approx(-23.43, abs=0.01)
    assert rec["center_lng"] == pytest.approx(-51.94, abs=0.01)
    assert rec["pct"] == pytest.approx(10.0)  # 2 resultados * 5 = 10%


def test_autopilot_sem_coordenadas_coverage_sem_lat_lng(tmp_path):
    """Quando os resultados nao trazem lat/lng, coverage grava center_lat=None (sem quebrar)."""
    sink = _sink(tmp_path)
    sink.upsert_profile("owner-1", niches=["estetica"], city="Maringa", state="PR", autopilot=True)
    maps = FakeMaps(_two_results())  # _two_results nao tem lat/lng

    run_autopilot(sink, maps, MockDraftProvider(), [], batch=20)

    cov = [c for c in sink._db["coverage"] if c["owner_id"] == "owner-1"]
    assert len(cov) == 1
    assert cov[0]["center_lat"] is None
    assert cov[0]["center_lng"] is None
    assert cov[0]["pct"] == pytest.approx(10.0)  # pct calculado pelo inserted mesmo sem coords
