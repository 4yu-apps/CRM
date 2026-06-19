from garimpo_esteira.config import FIXTURES_DIR
from garimpo_esteira.discovery import FixtureMapsSource, discover, result_to_lead
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
