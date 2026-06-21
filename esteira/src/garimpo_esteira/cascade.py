"""Cascata de enriquecimento — lê leads 'bruto', processa por fontes, escreve
proveniência + campos e avança para 'enriquecido'.

Garantias (critérios de aceite, Fase 2):
- Idempotente: proveniência é upsert; coluna só preenche se vazia; lead já
  enriquecido não volta pro lote. Rodar de novo não duplica nem re-processa.
- Campo ausente vira campo vazio, não erro: fonte que falha é ignorada.
- Respeita rate limit: lotes + delay entre leads.
"""
from __future__ import annotations

import time
from collections.abc import Sequence

from .match_rate import match_rate
from .models import ENRICHABLE_FIELDS, EnrichResult, Lead, LeadStatus
from .sink.base import LeadSink
from .sources.base import Source


def enrich_lead(lead: Lead, sources: Sequence[Source], sink: LeadSink) -> EnrichResult:
    all_findings = []
    column_updates: dict[str, object] = {}

    for src in sources:
        try:
            findings = src.enrich(lead)
        except Exception:
            findings = []  # fonte instável não derruba a cascata

        for f in findings:
            sink.record_provenance(lead.id, f.field_name, f.source, f.value, f.confidence)
            all_findings.append(f)
            # preenche coluna real só se estiver vazia (não sobrescreve edição humana)
            if f.field_name in ENRICHABLE_FIELDS and f.value and not lead.get(f.field_name):
                column_updates[f.field_name] = f.value
                setattr(lead, f.field_name, f.value)  # reflete no objeto p/ match_rate

    if column_updates:
        sink.update_lead_fields(lead.id, column_updates)

    rate = match_rate(lead)
    new_status: LeadStatus = "enriquecido"
    if lead.status != new_status:
        sink.set_status(lead.id, new_status, actor="system", note=f"match {int(rate * 100)}%")

    return EnrichResult(lead.id, all_findings, list(column_updates), rate, new_status)


def enrich_batch(
    sink: LeadSink,
    sources: Sequence[Source],
    *,
    batch: int = 20,
    delay: float = 0.0,
    status: LeadStatus = "bruto",
    owner_id: str | None = None,
) -> list[EnrichResult]:
    leads = sink.fetch_by_status(status, batch, owner_id)
    results: list[EnrichResult] = []
    for i, lead in enumerate(leads):
        try:
            results.append(enrich_lead(lead, sources, sink))
        except Exception:
            # Um lead (ou um soluco do sink) que falha nao derruba mais o lote:
            # pula este e segue. O lead fica em 'bruto' e o proximo run tenta de
            # novo — mas o resto avanca, nunca empaca a fila inteira.
            pass
        if delay and i < len(leads) - 1:
            time.sleep(delay)
    if results:
        owner_id = leads[0].owner_id or ""
        n = len(results)
        try:
            sink.log_activity(
                owner_id,
                "enriquecimento",
                f"Enriqueci {n} negocios com telefone, redes e site",
                ref_count=n,
            )
        except Exception:
            pass
    return results
