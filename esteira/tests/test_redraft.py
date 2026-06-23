"""Testes para o comando redraft (re-rascunha leads em rascunho_pronto).

TDD: estes testes foram escritos ANTES da implementacao.
"""
from __future__ import annotations

from datetime import datetime, timezone

from garimpo_esteira.draft import MockDraftProvider
from garimpo_esteira.draft_stage import redraft_batch
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _rascunho_pronto(sink, draft_generated_at=None, **kw):
    """Insere um lead ja em rascunho_pronto (status final do pipeline normal)."""
    defaults = dict(
        id="",
        owner_id="o",
        status="bruto",
        business_name="Loja X",
        phone="44999990001",
        rating=4.5,
        reviews_count=100,
    )
    defaults.update(kw)
    lid = sink.insert_lead(Lead(**defaults))
    # avanca ate rascunho_pronto sem usar draft_batch para nao precisar de provider
    sink.set_status(lid, "enriquecido")
    sink.set_status(lid, "qualificado")
    sink.set_status(lid, "rascunho_pronto")
    if draft_generated_at is not None:
        sink.update_lead_fields(lid, {"draft_generated_at": draft_generated_at})
    return lid


# ---- 1. fetch_redraft ----

def test_fetch_redraft_returns_only_rascunho_pronto(tmp_path):
    """fetch_redraft deve retornar apenas leads com status == rascunho_pronto."""
    sink = _sink(tmp_path)
    lid1 = _rascunho_pronto(sink, business_name="Alpha", phone="44999990001")
    # lead em outro status — nao deve aparecer
    lid2 = sink.insert_lead(Lead(
        id="", owner_id="o", status="bruto",
        business_name="Beta", phone="44999990002",
    ))
    sink.set_status(lid2, "enriquecido")  # status = enriquecido, nao rascunho_pronto

    results = sink.fetch_redraft(10)
    ids = [l.id for l in results]
    assert lid1 in ids
    assert lid2 not in ids


def test_fetch_redraft_sorted_none_first(tmp_path):
    """fetch_redraft ordena por draft_generated_at: None primeiro, depois mais antigo."""
    sink = _sink(tmp_path)

    lid_none = _rascunho_pronto(sink, business_name="SemData", phone="44999990003", draft_generated_at=None)
    lid_old = _rascunho_pronto(sink, business_name="Antiga", phone="44999990004", draft_generated_at="2024-01-01T00:00:00+00:00")
    lid_new = _rascunho_pronto(sink, business_name="Nova", phone="44999990005", draft_generated_at="2025-01-01T00:00:00+00:00")

    results = sink.fetch_redraft(10)
    ids = [l.id for l in results]

    # none vem primeiro
    assert ids.index(lid_none) < ids.index(lid_old)
    assert ids.index(lid_old) < ids.index(lid_new)


def test_fetch_redraft_respects_limit(tmp_path):
    """fetch_redraft respeita o limite."""
    sink = _sink(tmp_path)
    for i in range(5):
        _rascunho_pronto(sink, business_name=f"Lead{i}", phone=f"4499999000{i}")

    results = sink.fetch_redraft(3)
    assert len(results) == 3


def test_fetch_redraft_respects_owner_id(tmp_path):
    """fetch_redraft com owner_id retorna apenas leads desse dono."""
    sink = _sink(tmp_path)
    lid_a = _rascunho_pronto(sink, business_name="DonoA", phone="44999990010", owner_id="dono_a")
    lid_b = _rascunho_pronto(sink, business_name="DonoB", phone="44999990011", owner_id="dono_b")

    results = sink.fetch_redraft(10, owner_id="dono_a")
    ids = [l.id for l in results]
    assert lid_a in ids
    assert lid_b not in ids


# ---- 2. redraft_batch ----

def test_redraft_batch_rewrites_all_rascunho_pronto(tmp_path):
    """redraft_batch re-escreve draft_msg1/2 para todos os leads rascunho_pronto."""
    sink = _sink(tmp_path)
    provider = MockDraftProvider()

    lid1 = _rascunho_pronto(sink, business_name="Forte", phone="44999990020")
    lid2 = _rascunho_pronto(sink, business_name="Vigor", phone="44999990021")

    # marca draft_generated_at no passado para que sejam processados
    past = "2024-06-01T00:00:00+00:00"
    sink.update_lead_fields(lid1, {"draft_generated_at": past})
    sink.update_lead_fields(lid2, {"draft_generated_at": past})

    run_start = _now_iso()
    total = redraft_batch(sink, provider, batch=30, run_start=run_start)

    assert total == 2
    lead1 = sink.get_lead(lid1)
    lead2 = sink.get_lead(lid2)
    # draft_msg reescrito
    assert lead1.draft_msg1 and "Forte" in lead1.draft_msg1
    assert lead2.draft_msg1 and "Vigor" in lead2.draft_msg1
    # draft_generated_at atualizado (> passado)
    assert lead1.draft_generated_at > past
    assert lead2.draft_generated_at > past


def test_redraft_batch_does_not_change_status(tmp_path):
    """redraft_batch nao muda o status — lead continua rascunho_pronto."""
    sink = _sink(tmp_path)
    lid = _rascunho_pronto(sink, business_name="Campeao", phone="44999990022")
    sink.update_lead_fields(lid, {"draft_generated_at": "2024-01-01T00:00:00+00:00"})

    redraft_batch(sink, MockDraftProvider(), batch=30, run_start=_now_iso())

    lead = sink.get_lead(lid)
    assert lead.status == "rascunho_pronto"


def test_redraft_batch_same_run_start_does_not_reprocess(tmp_path):
    """Rodar novamente com o mesmo run_start nao reprocessa leads ja feitos."""
    sink = _sink(tmp_path)
    lid = _rascunho_pronto(sink, business_name="Flash", phone="44999990023")
    sink.update_lead_fields(lid, {"draft_generated_at": "2024-01-01T00:00:00+00:00"})

    run_start = _now_iso()
    total1 = redraft_batch(sink, MockDraftProvider(), batch=30, run_start=run_start)
    # segunda chamada com mesmo run_start: draft_generated_at >= run_start, nao reprocessa
    total2 = redraft_batch(sink, MockDraftProvider(), batch=30, run_start=run_start)

    assert total1 == 1
    assert total2 == 0


def test_redraft_batch_updates_draft_generated_at(tmp_path):
    """redraft_batch atualiza draft_generated_at para um valor mais recente."""
    sink = _sink(tmp_path)
    old_ts = "2023-01-01T00:00:00+00:00"
    lid = _rascunho_pronto(sink, business_name="Tempo", phone="44999990024", draft_generated_at=old_ts)

    run_start = _now_iso()
    redraft_batch(sink, MockDraftProvider(), batch=30, run_start=run_start)

    lead = sink.get_lead(lid)
    assert lead.draft_generated_at > old_ts


# ---- 3. opt_out — nao gera copy e sai da fila ----

def test_redraft_batch_opt_out_no_infinite_loop(tmp_path):
    """Lead com opt_out nao causa loop infinito: sai da fila via draft_generated_at=run_start."""
    sink = _sink(tmp_path)
    lid = _rascunho_pronto(sink, business_name="Desistiu", phone="44999990030")
    # marca opt_out e draft_generated_at no passado (entraria na fila)
    sink.update_lead_fields(lid, {"opt_out": True, "draft_generated_at": "2024-01-01T00:00:00+00:00"})

    run_start = _now_iso()
    total = redraft_batch(sink, MockDraftProvider(), batch=30, run_start=run_start)

    # opt_out nao conta como rascunho gerado
    assert total == 0
    # mas saiu da fila (draft_generated_at carimbado)
    lead = sink.get_lead(lid)
    assert lead.draft_generated_at >= run_start


def test_redraft_batch_opt_out_no_copy_generated(tmp_path):
    """Lead opt_out nao recebe draft_msg1/2."""
    sink = _sink(tmp_path)
    lid = _rascunho_pronto(sink, business_name="FugaLGPD", phone="44999990031")
    sink.update_lead_fields(lid, {"opt_out": True, "draft_generated_at": "2024-01-01T00:00:00+00:00"})

    redraft_batch(sink, MockDraftProvider(), batch=30, run_start=_now_iso())

    lead = sink.get_lead(lid)
    # sem copy nova gerada (draft_one retornou None)
    assert not lead.draft_msg1


# ---- 4. outros status nao sao tocados ----

def test_redraft_batch_ignores_other_statuses(tmp_path):
    """redraft_batch nao toca leads em status diferente de rascunho_pronto."""
    sink = _sink(tmp_path)
    lid_enviado = sink.insert_lead(Lead(
        id="", owner_id="o", status="bruto",
        business_name="Enviado", phone="44999990040",
    ))
    # avanca ate 'enviado'
    sink.set_status(lid_enviado, "enriquecido")
    sink.set_status(lid_enviado, "qualificado")
    sink.set_status(lid_enviado, "rascunho_pronto")
    sink.set_status(lid_enviado, "enviado")

    lid_bruto = sink.insert_lead(Lead(
        id="", owner_id="o", status="bruto",
        business_name="Bruto", phone="44999990041",
    ))

    total = redraft_batch(sink, MockDraftProvider(), batch=30, run_start=_now_iso())

    assert total == 0
    # status nao mudou
    assert sink.get_lead(lid_enviado).status == "enviado"
    assert sink.get_lead(lid_bruto).status == "bruto"


# ---- 5. run.py: cmd_redraft (CLI smoke test) ----

def test_cmd_redraft_smoke(tmp_path):
    """cmd_redraft deve rodar sem erro e imprimir o resumo."""
    import io
    import sys
    from garimpo_esteira.config import Config
    from garimpo_esteira.run import cmd_redraft

    sink_path = tmp_path / "db.json"
    from garimpo_esteira.sink import JsonFileSink as JFS

    s = JFS(sink_path)
    lid = _rascunho_pronto(s, business_name="CLI", phone="44999990050")
    s.update_lead_fields(lid, {"draft_generated_at": "2024-01-01T00:00:00+00:00"})
    del s

    cfg = Config(sink="jsonfile", json_path=sink_path, llm="mock", batch=30)
    captured = io.StringIO()
    old_stdout = sys.stdout
    sys.stdout = captured
    try:
        cmd_redraft(cfg)
    finally:
        sys.stdout = old_stdout
    out = captured.getvalue()
    assert "redraft" in out.lower()
    assert "1" in out  # 1 lead processado
