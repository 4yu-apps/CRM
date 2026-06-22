"""Estágio de rascunho — qualificado -> rascunho_pronto.

A IA escreve as 2 mensagens; o humano edita e aprova depois (no front). O
sistema NUNCA envia. Respeita opt-out (LGPD): lead opt-out não gera copy de
contato — fica em 'qualificado'.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .draft.base import DraftProvider
from .sink.base import LeadSink


def draft_one(
    lead, provider: DraftProvider, sink: LeadSink, profession: str | None = None
) -> tuple[str, str] | None:
    if lead.opt_out:
        return None  # LGPD: não rascunha contato pra quem pediu opt-out
    # profissao do dono guia a copy (lida em prompt.build_prompt / mock via getattr)
    if profession:
        setattr(lead, "profession", profession)
    msg1, msg2 = provider.generate(lead)
    sink.update_lead_fields(lead.id, {
        "draft_msg1": msg1,
        "draft_msg2": msg2,
        "draft_model": provider.model,
        "draft_generated_at": datetime.now(timezone.utc).isoformat(),
    })
    if lead.status != "rascunho_pronto":
        sink.set_status(lead.id, "rascunho_pronto", actor="system", note=f"rascunho via {provider.model}")
    return msg1, msg2


def draft_batch(
    sink: LeadSink, provider: DraftProvider, *, batch: int = 20, status="qualificado",
    owner_id: str | None = None, profession: str | None = None,
) -> list[tuple[str, tuple[str, str]]]:
    leads = sink.fetch_by_status(status, batch, owner_id)
    out: list[tuple[str, tuple[str, str]]] = []
    for lead in leads:
        result = draft_one(lead, provider, sink, profession)
        if result:
            out.append((lead.id, result))
    if out and leads:
        owner_id = leads[0].owner_id or ""
        n = len(out)
        try:
            sink.log_activity(
                owner_id,
                "rascunho",
                f"Escrevi a abordagem de {n} leads, prontos pra voce revisar",
                ref_count=n,
            )
        except Exception:
            pass
    return out
