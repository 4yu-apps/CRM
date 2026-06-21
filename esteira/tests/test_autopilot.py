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
