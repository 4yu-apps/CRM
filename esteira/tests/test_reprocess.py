"""Parte 2 — reprocessamento: re-score SEM mexer no status + ondas resumíveis.

A garantia crítica: rescore_no_status NUNCA transiciona status (um lead já em
rascunho_pronto não pode regredir pra descartado só porque a régua de score mudou).
E fetch_reprocess varre a base em ondas (reprocessed_at mais antigo / nulo primeiro).
"""
from garimpo_esteira.models import Lead
from garimpo_esteira.score_stage import rescore_no_status
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def test_rescore_no_status_nao_muda_status(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="rascunho_pronto",
        phone="44999990001", rating=4.7, reviews_count=300,
    ))
    lead = sink.get_lead(lid)
    res = rescore_no_status(lead, sink, extra_fields={"reprocessed_at": "2026-06-26T00:00:00Z"})
    refreshed = sink.get_lead(lid)
    assert refreshed.status == "rascunho_pronto"          # status intacto
    assert refreshed.score == res.score                   # score regravado
    assert refreshed.score is not None
    assert refreshed.reprocessed_at == "2026-06-26T00:00:00Z"


def test_rescore_no_status_min_score_rebaixa_sem_mexer_no_status(tmp_path):
    sink = _sink(tmp_path)
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="rascunho_pronto",
        phone="44999990001", rating=4.7, reviews_count=300,
    ))
    lead = sink.get_lead(lid)
    res = rescore_no_status(lead, sink, min_score=999)     # piso impossível derruba
    refreshed = sink.get_lead(lid)
    assert res.decision == "descartado"
    assert refreshed.status == "rascunho_pronto"           # mesmo rebaixado, status fica
    assert refreshed.service_target == "indefinido"


def test_fetch_reprocess_nulo_e_mais_antigo_primeiro(tmp_path):
    sink = _sink(tmp_path)
    a = sink.insert_lead(Lead(id="", owner_id="o", business_name="A"))
    b = sink.insert_lead(Lead(id="", owner_id="o", business_name="B"))
    sink.update_lead_fields(a, {"reprocessed_at": "2026-06-26T10:00:00Z"})  # A já reprocessado
    got = [lead.id for lead in sink.fetch_reprocess(10)]
    assert got[0] == b                                     # B nulo vem primeiro
    assert got.index(b) < got.index(a)
