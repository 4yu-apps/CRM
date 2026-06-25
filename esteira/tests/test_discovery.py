from garimpo_esteira.config import FIXTURES_DIR
from garimpo_esteira.discovery import FixtureMapsSource, PlacesMapsSource, discover, result_to_lead
from garimpo_esteira.sink import JsonFileSink


def _maps():
    return FixtureMapsSource(FIXTURES_DIR / "maps_results.json")


def test_result_to_lead_maps_fields():
    raw = {
        "name": "Pizzaria Nova",
        "formatted_phone_number": "(44) 3025-1000",
        "rating": 4.6,
        "user_ratings_total": 210,
        "place_id": "p1",
    }
    lead, findings = result_to_lead(raw, "owner")
    assert lead.status == "bruto"
    assert lead.business_name == "Pizzaria Nova"
    assert lead.phone == "4430251000"
    assert lead.rating == 4.6
    fields = {f.field_name for f in findings}
    assert fields == {"business_name", "phone"}
    assert all(f.source == "google_maps" for f in findings)


def test_discover_inserts_bruto_with_provenance(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    res = discover(sink, _maps(), ["pizzaria"], "owner")
    assert res["inserted"] == 3
    counts = sink.counts()
    assert counts.get("bruto") == 3
    # proveniencia google_maps gravada
    import json

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert any(p["source"] == "google_maps" for p in db["provenance"])


def test_discover_dedup_on_rerun(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    discover(sink, _maps(), ["pizzaria"], "owner")
    res2 = discover(sink, _maps(), ["pizzaria"], "owner")
    assert res2["inserted"] == 0
    assert res2["skipped"] == 3  # todos dedup por telefone/place


def test_lead_without_phone_still_inserted(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    # Cafeteria Grao nao tem telefone na fixture
    discover(sink, _maps(), ["cafeteria"], "owner")
    leads = sink.fetch_by_status("bruto", 10)
    cafe = next(l for l in leads if "Cafeteria" in (l.business_name or ""))
    assert cafe.phone is None


def test_discover_descarta_country_us(tmp_path):
    """Lead com country='US' deve ser descartado pela trava Brasil."""
    sink = JsonFileSink(tmp_path / "db.json")

    class FakeSource:
        name = "fake"

        def search(self, term: str) -> list[dict]:
            return [
                {
                    "name": "Cinta Aveda Institute",
                    "phone": "4086482555",
                    "country": "US",
                    "state": "CA",
                    "address": "2483 Cabrillo Ave, Santa Clara, CA, United States",
                    "place_id": "us_p1",
                },
                {
                    "name": "Barbearia Corte Fino BR",
                    "formatted_phone_number": "(44) 99888-2000",
                    "country": "BR",
                    "state": "PR",
                    "city": "Maringa",
                    "place_id": "br_p1",
                },
            ]

    res = discover(sink, FakeSource(), ["barbearia"], "owner")
    assert res["inserted"] == 1, "Apenas o lead BR deve ser inserido"
    assert res["skipped"] >= 1, "O lead US deve ser pulado"
    leads = sink.fetch_by_status("bruto", 10)
    names = [l.business_name for l in leads]
    assert "Cinta Aveda Institute" not in names
    assert "Barbearia Corte Fino BR" in names


def test_discover_descarta_looks_foreign_sem_country(tmp_path):
    """Lead sem country mas com address estrangeiro deve ser descartado via looks_foreign."""
    sink = JsonFileSink(tmp_path / "db.json")

    class FakeSource:
        name = "fake"

        def search(self, term: str) -> list[dict]:
            return [
                {
                    "name": "Loja EUA",
                    "address": "123 Main St, San Francisco, California, USA",
                    "state": "CA",
                    "place_id": "eua_p1",
                },
            ]

    res = discover(sink, FakeSource(), ["loja"], "owner")
    assert res["inserted"] == 0
    assert res["skipped"] >= 1


def test_discover_fixture_br_nao_descartada(tmp_path):
    """Fixtures BR (sem campo country) devem ser inseridas normalmente."""
    sink = JsonFileSink(tmp_path / "db.json")
    res = discover(sink, _maps(), ["pizzaria"], "owner")
    assert res["inserted"] == 3, "Fixtures BR nao devem ser descartadas pela trava Brasil"


# ------------------------------------------------------------------
# Fase 5: teto de custo no Places Text Search (SKU pago). Por-run: para de
# buscar quando bate o limite (segue no proximo cron), evita runaway na fatura.
# ------------------------------------------------------------------

def test_places_text_search_respeita_teto_por_run():
    src = PlacesMapsSource("key", max_pages=1, request_limit=2)
    calls = {"n": 0}

    def fake_page(term, token):
        calls["n"] += 1
        return ([{"displayName": {"text": f"Biz {calls['n']}"}}], None)

    src._fetch_page = fake_page
    src.search("a em Maringa")
    src.search("b em Maringa")
    src.search("c em Maringa")  # 3a barrada pelo teto de 2
    assert calls["n"] == 2


def test_places_text_search_sem_teto_quando_zero():
    src = PlacesMapsSource("key", max_pages=1, request_limit=0)
    calls = {"n": 0}

    def fake_page(term, token):
        calls["n"] += 1
        return ([], None)

    src._fetch_page = fake_page
    src.search("a")
    src.search("b")
    src.search("c")
    assert calls["n"] == 3
