"""Testes de log de atividade e cobertura de varredura.

Cobre:
- log_activity no JsonFileSink (insere e persiste)
- upsert_coverage no JsonFileSink (insert + update por chave unica)
- draft_batch emite evento de atividade do tipo 'rascunho'
"""
import json
from unittest.mock import patch

import pytest

from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft_stage import draft_batch
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


# ---- log_activity ----

def test_log_activity_inserts_entry(tmp_path):
    sink = _sink(tmp_path)
    sink.log_activity("owner-1", "busca", "Varri pizzaria e achei 5 negocios novos", ref_count=5)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert "activity" in db
    assert len(db["activity"]) == 1
    entry = db["activity"][0]
    assert entry["owner_id"] == "owner-1"
    assert entry["tipo"] == "busca"
    assert entry["ref_count"] == 5
    assert "criou" not in entry["text"]  # sem AI-tell
    assert "negocios novos" in entry["text"]


def test_log_activity_appends_multiple(tmp_path):
    sink = _sink(tmp_path)
    sink.log_activity("o", "busca", "Varri x e achei 3 negocios novos", ref_count=3)
    sink.log_activity("o", "enriquecimento", "Enriqueci 3 negocios com telefone, redes e site", ref_count=3)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db["activity"]) == 2
    tipos = [e["tipo"] for e in db["activity"]]
    assert "busca" in tipos
    assert "enriquecimento" in tipos


def test_log_activity_persists_across_reload(tmp_path):
    path = tmp_path / "db.json"
    sink = JsonFileSink(path)
    sink.log_activity("o", "rascunho", "Escrevi a abordagem de 2 leads, prontos pra voce revisar", ref_count=2)

    # recarrega do disco
    sink2 = JsonFileSink(path)
    db = sink2._db
    assert len(db.get("activity", [])) == 1
    assert db["activity"][0]["ref_count"] == 2


def test_log_activity_without_ref_count(tmp_path):
    sink = _sink(tmp_path)
    sink.log_activity("o", "descarte", "Descartei alguns que nao batem com o perfil")

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert db["activity"][0]["ref_count"] is None


# ---- upsert_coverage ----

def test_upsert_coverage_inserts(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_coverage("o", "pizzaria", "pizzaria", result_count=5, pct=0.8)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db["coverage"]) == 1
    c = db["coverage"][0]
    assert c["owner_id"] == "o"
    assert c["region_key"] == "pizzaria"
    assert c["niche"] == "pizzaria"
    assert c["result_count"] == 5
    assert c["pct"] == 0.8


def test_upsert_coverage_updates_existing_key(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_coverage("o", "barbearia", "barbearia", result_count=3, pct=0.5)
    sink.upsert_coverage("o", "barbearia", "barbearia", result_count=10, pct=0.9,
                         region_name="Barbearia centro")

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    # deve ter apenas 1 registro (upsert, nao duplica)
    assert len(db["coverage"]) == 1
    c = db["coverage"][0]
    assert c["result_count"] == 10
    assert c["pct"] == 0.9
    assert c["region_name"] == "Barbearia centro"


def test_upsert_coverage_distinct_niches_same_region(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_coverage("o", "centro", "pizzaria", result_count=4)
    sink.upsert_coverage("o", "centro", "barbearia", result_count=7)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db["coverage"]) == 2


def test_upsert_coverage_distinct_owners_same_key(tmp_path):
    sink = _sink(tmp_path)
    sink.upsert_coverage("owner-a", "centro", "pizzaria", result_count=2)
    sink.upsert_coverage("owner-b", "centro", "pizzaria", result_count=9)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    assert len(db["coverage"]) == 2


# ---- integracao: draft_batch emite atividade ----

def _qualificado(sink, **kw):
    lid = sink.insert_lead(Lead(id="", owner_id="owner-x", status="bruto", **kw))
    sink.set_status(lid, "enriquecido")
    sink.set_status(lid, "qualificado")
    return lid


def test_draft_batch_emits_rascunho_activity(tmp_path):
    sink = _sink(tmp_path)
    _qualificado(sink, business_name="Forte", phone="44999990001", rating=4.7, reviews_count=200)

    draft_batch(sink, MockDraftProvider(), batch=20)

    db = json.loads((tmp_path / "db.json").read_text("utf-8"))
    activities = db.get("activity", [])
    rascunho = [a for a in activities if a["tipo"] == "rascunho"]
    assert len(rascunho) == 1
    assert rascunho[0]["ref_count"] == 1
    assert rascunho[0]["owner_id"] == "owner-x"
    assert "rascunho" not in rascunho[0]["text"].lower() or "abordagem" in rascunho[0]["text"].lower()


def test_draft_batch_no_activity_when_nothing_drafted(tmp_path):
    sink = _sink(tmp_path)
    # nenhum lead qualificado
    draft_batch(sink, MockDraftProvider(), batch=20)

    # sem leads para rascunhar, o arquivo pode nem ter sido criado;
    # o importante e que nenhuma atividade foi gravada no sink em memoria
    assert sink._db.get("activity", []) == []
