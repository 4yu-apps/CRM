"""Estágio de score — enriquecido -> qualificado | descartado.

Lê os sinais (incl. ads_active da proveniência), pontua contra o ICP e grava
score + score_reason (explicável). Idempotente: lead já pontuado saiu de
'enriquecido', não volta pro lote.
"""
from __future__ import annotations

from .scoring import ScoreResult, score_lead
from .sink.base import LeadSink


def _ads_signal(provenance: list[dict]) -> bool | None:
    for p in provenance:
        if p.get("field_name") == "ads_active":
            return p.get("value") == "sim"
    return None


def score_one(lead, sink: LeadSink) -> ScoreResult:
    signals = {"ads_active": _ads_signal(sink.fetch_provenance(lead.id))}
    result = score_lead(lead, signals)
    sink.update_lead_fields(lead.id, {"score": result.score, "score_reason": result.reason})
    if lead.status != result.decision:
        sink.set_status(lead.id, result.decision, actor="system", note=f"score {result.score}")
    return result


def score_batch(sink: LeadSink, *, batch: int = 20, status="enriquecido") -> list[ScoreResult]:
    return [score_one(lead, sink) for lead in sink.fetch_by_status(status, batch)]
