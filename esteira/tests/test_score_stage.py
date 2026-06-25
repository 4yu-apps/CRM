from garimpo_esteira.models import Lead
from garimpo_esteira.score_stage import score_batch, score_one
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


# ------------------------------------------------------------------
# Fase 8: batch da proveniencia (corta N+1) + score_one aceita prov pronta
# ------------------------------------------------------------------

def test_fetch_provenance_many_agrupa_por_lead(tmp_path):
    sink = _sink(tmp_path)
    a = sink.insert_lead(Lead(id="", owner_id="o", business_name="A"))
    b = sink.insert_lead(Lead(id="", owner_id="o", business_name="B"))
    sink.record_provenance(a, "ads_active", "website", "sim", 0.6)
    sink.record_provenance(b, "instagram_status", "instagram", "parado", 0.7)
    by = sink.fetch_provenance_many([a, b])
    assert {p["field_name"] for p in by[a]} == {"ads_active"}
    assert {p["field_name"] for p in by[b]} == {"instagram_status"}
    assert sink.fetch_provenance_many([]) == {}


def test_score_one_usa_prov_injetada_sem_buscar(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="enriquecido",
                                phone="44999990001", rating=4.6, reviews_count=200, website=None))
    lead = sink.get_lead(lid)
    # prov injetada (sem ir ao sink): ads_active=nao deve refletir no score trafego
    prov = [{"field_name": "ads_active", "value": "nao"}]
    r = score_one(lead, sink, prov=prov)
    assert r.reason["trafego"]["score"] > 0


def _enriquecido(sink, **kw):
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", **kw))
    sink.set_status(lid, "enriquecido")
    return lid


def test_score_stage_qualifies_and_discards(tmp_path):
    sink = _sink(tmp_path)
    _enriquecido(sink, business_name="Forte", phone="44999990001", rating=4.7, reviews_count=300)
    _enriquecido(sink, business_name="Fraco", phone="44999990002", rating=3.4, reviews_count=8)

    results = score_batch(sink, batch=20)
    assert len(results) == 2
    counts = sink.counts()
    assert counts.get("qualificado") == 1
    assert counts.get("descartado") == 1


def test_score_stage_writes_score_and_reason(tmp_path):
    sink = _sink(tmp_path)
    lid = _enriquecido(sink, phone="44999990001", rating=4.6, reviews_count=200, website=None)
    score_batch(sink, batch=20)
    lead = sink.get_lead(lid)
    assert lead.score is not None
    assert lead.score_reason["decision"] == lead.status


def test_score_stage_reads_ads_signal_from_provenance(tmp_path):
    sink = _sink(tmp_path)
    lid = _enriquecido(sink, phone="44999990001", rating=4.4, reviews_count=200, website=None, instagram=None)
    sink.record_provenance(lid, "ads_active", "meta_ad_library", "nao", 0.8)
    score_batch(sink, batch=20)
    lead = sink.get_lead(lid)
    note = " ".join(c["note"] for c in lead.score_reason["criteria"])
    assert "nao anuncia" in note


def test_score_stage_idempotent(tmp_path):
    sink = _sink(tmp_path)
    _enriquecido(sink, phone="44999990001", rating=4.6, reviews_count=200)
    score_batch(sink, batch=20)
    assert score_batch(sink, batch=20) == []  # nada mais em 'enriquecido'
