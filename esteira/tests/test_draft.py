from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft_stage import draft_batch, draft_one
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def _qualificado(sink, **kw):
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", **kw))
    sink.set_status(lid, "enriquecido")
    sink.set_status(lid, "qualificado")
    return lid


def test_mock_provider_returns_two_messages():
    p = MockDraftProvider()
    m1, m2 = p.generate(Lead(id="l", owner_id="o", business_name="Studio Bella", rating=4.8, reviews_count=200))
    assert "Studio Bella" in m1
    assert m1 and m2 and m1 != m2
    assert p.model == "mock"


def test_draft_stage_advances_to_rascunho_pronto(tmp_path):
    sink = _sink(tmp_path)
    lid = _qualificado(sink, business_name="Forte", phone="44999990001", rating=4.7, reviews_count=200)
    draft_batch(sink, MockDraftProvider(), batch=20)
    lead = sink.get_lead(lid)
    assert lead.status == "rascunho_pronto"
    assert lead.draft_msg1 and lead.draft_msg2
    assert lead.draft_model == "mock"
    assert lead.draft_generated_at is not None


def test_draft_respects_opt_out_lgpd(tmp_path):
    sink = _sink(tmp_path)
    lid = _qualificado(sink, business_name="X", phone="44999990001", rating=4.7, reviews_count=200)
    sink.update_lead_fields(lid, {"opt_out": True})
    lead = sink.get_lead(lid)
    assert draft_one(lead, MockDraftProvider(), sink) is None
    assert sink.get_lead(lid).status == "qualificado"  # não avançou


def test_draft_idempotent(tmp_path):
    sink = _sink(tmp_path)
    _qualificado(sink, phone="44999990001", rating=4.7, reviews_count=200)
    draft_batch(sink, MockDraftProvider(), batch=20)
    assert draft_batch(sink, MockDraftProvider(), batch=20) == []  # nada em 'qualificado'
