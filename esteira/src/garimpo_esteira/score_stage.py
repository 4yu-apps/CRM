"""Estágio de score — enriquecido -> qualificado | descartado.

Lê os sinais (incl. ads_active da proveniência), pontua contra o ICP e grava
score + score_reason (explicável). Idempotente: lead já pontuado saiu de
'enriquecido', não volta pro lote.
"""
from __future__ import annotations

from .pricing import suggest_value
from .scoring import ScoreResult, score_lead
from .sink.base import LeadSink


def _ads_signal(provenance: list[dict]) -> bool | None:
    for p in provenance:
        if p.get("field_name") == "ads_active":
            return p.get("value") == "sim"
    return None


def _ig_signal(provenance: list[dict]) -> str | None:
    for p in provenance:
        if p.get("field_name") == "instagram_status":
            return p.get("value")  # "ativo" | "parado"
    return None


def score_one(lead, sink: LeadSink, profession: str | None = None, min_score: int = 0) -> ScoreResult:
    prov = sink.fetch_provenance(lead.id)
    ads_active = _ads_signal(prov)
    ig_status = _ig_signal(prov)
    # sinais tecnicos do site (de graca) entram no score; ads_active tambem pode
    # vir derivado do Pixel detectado no HTML.
    signals = {"ads_active": ads_active, "site": getattr(lead, "site_signals", None) or {}, "instagram_status": ig_status}
    result = score_lead(lead, signals, profession)
    # #19: piso de score por dono. Alem do THRESHOLD global, o dono pode exigir
    # uma nota minima maior. min_score=0 (default) = sem filtro extra. Ao rebaixar,
    # sincroniza reason/service_target pra ficha nao mostrar "qualificado" incoerente.
    if min_score and result.score < min_score and result.decision != "descartado":
        result.decision = "descartado"
        result.service_target = "indefinido"
        if isinstance(result.reason, dict):
            result.reason["decision"] = "descartado"
            result.reason["service_target"] = "indefinido"
            result.reason["verdict"] = f"abaixo do seu score minimo ({min_score})"
    fields: dict[str, object] = {
        "score": result.score,
        "score_reason": result.reason,
        "service_target": result.service_target,
        "ads_active": ads_active,
    }
    # B8: ja deixa um valor sugerido pro lead qualificado (aparece na ficha e na
    # Reuniao). E sugestao com motivo; a humana decide na conversa.
    if result.decision == "qualificado":
        stack = (getattr(lead, "site_signals", None) or {}).get("stack")
        value, reason = suggest_value(
            result.service_target, lead.reviews_count, lead.rating,
            category=lead.category, stack=stack,
        )
        fields["suggested_value"] = value
        fields["suggested_value_reason"] = reason
    sink.update_lead_fields(lead.id, fields)
    if lead.status != result.decision:
        sink.set_status(lead.id, result.decision, actor="system", note=f"score {result.score}")
    return result


def score_batch(
    sink: LeadSink, *, batch: int = 20, status="enriquecido", owner_id: str | None = None,
    profession: str | None = None, min_score: int = 0,
) -> list[ScoreResult]:
    leads = sink.fetch_by_status(status, batch, owner_id)
    results = [score_one(lead, sink, profession, min_score) for lead in leads]
    discarded = [r for r in results if r.decision == "descartado"]
    if discarded and leads:
        owner_id = leads[0].owner_id or ""
        n = len(discarded)
        try:
            sink.log_activity(
                owner_id,
                "descarte",
                f"Descartei {n} que nao batem com o perfil",
                ref_count=n,
            )
        except Exception:
            pass
    return results
