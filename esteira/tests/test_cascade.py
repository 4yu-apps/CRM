import json

from garimpo_esteira.cascade import enrich_batch
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink
from garimpo_esteira.sources import AdLibrarySource, CnpjSource, InstagramSource, WebsiteSource

FAKE_CNPJ = {
    "11222333000144": {
        "ddd_telefone_1": "44 99999-0002",
        "email": "contato@studiobella.com.br",
        "qsa": [{"nome_socio": "Marina Alves"}],
    }
}


def _sources(ad_probe=None):
    return [
        CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c)),
        InstagramSource(),
        WebsiteSource(reachable=lambda _u: True),
        AdLibrarySource(probe=ad_probe),
    ]


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def test_cascade_enriches_and_advances(tmp_path):
    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto",
                          business_name="Studio Bella", cnpj="11.222.333/0001-44",
                          instagram="instagram.com/studiobella"))
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto",
                          business_name="Pizzaria", phone="(44) 99999-0001"))

    results = enrich_batch(sink, _sources(), batch=20, delay=0)
    assert len(results) == 2
    assert all(r.new_status == "enriquecido" for r in results)
    assert sink.counts() == {"enriquecido": 2}

    # lead com CNPJ saiu com telefone + dono
    bella = next(r for r in results if "phone" in r.fields_filled)
    lead = sink.get_lead(bella.lead_id)
    assert lead.phone == "44999990002"
    assert lead.owner_name == "Marina Alves"
    assert bella.match_rate > 0.5


def test_cascade_records_provenance(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(), batch=20, delay=0)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    prov = [p for p in db["provenance"] if p["lead_id"] == lid]
    fields = {p["field_name"] for p in prov}
    assert {"phone", "owner_name", "email"} <= fields
    assert all(p["source"] == "cnpj_brasilapi" for p in prov)


def test_cascade_is_idempotent(tmp_path):
    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(), batch=20, delay=0)
    db1 = (tmp_path / "db.json").read_text("utf-8")

    # roda de novo: status já é enriquecido, não há 'bruto' -> nada muda
    second = enrich_batch(sink, _sources(), batch=20, delay=0)
    assert second == []
    db2 = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db2["provenance"]) == len(json.loads(db1)["provenance"])


def test_dedup_blocks_same_cnpj(tmp_path):
    sink = _sink(tmp_path)
    first = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    dup = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11222333000144"))
    assert first is not None
    assert dup is None


def test_ad_library_signal_is_provenance_not_column(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    enrich_batch(sink, _sources(ad_probe=lambda _lead: True), batch=20, delay=0)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    ads = [p for p in db["provenance"] if p["field_name"] == "ads_active"]
    assert ads and ads[0]["value"] == "sim"
    # ads_active não é coluna do lead
    assert "ads_active" not in db["leads"][lid]


def test_failing_source_does_not_break_cascade(tmp_path):
    class Boom:
        name = "boom"

        def enrich(self, lead):
            raise RuntimeError("fonte instavel")

    sink = _sink(tmp_path)
    sink.insert_lead(Lead(id="", owner_id="o", status="bruto", cnpj="11.222.333/0001-44"))
    results = enrich_batch(sink, [Boom(), CnpjSource(fetch=lambda c: FAKE_CNPJ.get(c))], batch=20, delay=0)
    assert results[0].new_status == "enriquecido"
    assert sink.get_lead(results[0].lead_id).phone == "44999990002"
