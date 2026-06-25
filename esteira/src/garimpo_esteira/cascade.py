"""Cascata de enriquecimento — lê leads 'bruto', processa por fontes, escreve
proveniência + campos e avança para 'enriquecido'.

Garantias (critérios de aceite, Fase 2):
- Idempotente: proveniência é upsert; coluna só preenche se vazia; lead já
  enriquecido não volta pro lote. Rodar de novo não duplica nem re-processa.
- Campo ausente vira campo vazio, não erro: fonte que falha é ignorada.
- Respeita rate limit: lotes + delay entre leads.
"""
from __future__ import annotations

import json
import time
from collections.abc import Sequence

from .match_rate import match_rate
from .models import ENRICHABLE_FIELDS, EnrichResult, Lead, LeadStatus
from .sink.base import LeadSink
from .sources.base import Source

_SOCIAL_FIELDS = {
    "instagram_followers": ("followers", int),
    "instagram_media_count": ("media_count", int),
    "instagram_last_post": ("last_post", str),
    "instagram_post_freq": ("post_freq", float),
    "instagram_post_freq_label": ("post_freq_label", str),
    "instagram_engagement": ("engagement", float),
    "instagram_status": ("ig_status", str),
    "ads_count": ("ads_count", int),
    "ads_since": ("ads_since", str),
}


def _social_value(field_name: str, value: str | None):
    if field_name == "ads_active":
        if value == "sim":
            return True
        if value == "nao":
            return False
        return None
    spec = _SOCIAL_FIELDS.get(field_name)
    if not spec or value is None:
        return None
    _, cast = spec
    try:
        return cast(value)
    except (TypeError, ValueError):
        return None


def enrich_lead(
    lead: Lead, sources: Sequence[Source], sink: LeadSink, *, advance_status: bool = True
) -> EnrichResult:
    """Roda as fontes, grava proveniencia + campos vazios. Com advance_status,
    avanca bruto->enriquecido (pipeline normal); sem, so preenche campos sem
    mexer no status (usado pelo backfill de leads ja avancados)."""
    all_findings = []
    column_updates: dict[str, object] = {}
    social = dict(getattr(lead, "social_signals", None) or {})
    social_changed = False

    for src in sources:
        try:
            findings = src.enrich(lead)
        except Exception:
            findings = []  # fonte instável não derruba a cascata

        for f in findings:
            sink.record_provenance(lead.id, f.field_name, f.source, f.value, f.confidence)
            all_findings.append(f)
            # site_signals: chega como JSON; vira a coluna jsonb (sempre atualiza,
            # e o retrato mais novo do site). Nao passa pelo gate de ENRICHABLE.
            if f.field_name == "site_signals" and f.value:
                try:
                    incoming = json.loads(f.value)
                    if not isinstance(incoming, dict):
                        continue
                    base = (
                        column_updates.get("site_signals")
                        or getattr(lead, "site_signals", None)
                        or {}
                    )
                    merged = {**base, **incoming}
                    column_updates["site_signals"] = merged
                    setattr(lead, "site_signals", merged)
                    platforms = merged.get("ad_platforms") or []
                    if platforms:
                        social["ad_platforms"] = list(dict.fromkeys(platforms))
                        social_changed = True
                except (ValueError, TypeError):
                    pass
                continue
            if f.field_name == "ads_active":
                value = _social_value(f.field_name, f.value)
                if value is not None:
                    social["ads_active"] = value
                    if value is True and f.source == "meta_ad_library":
                        social["ad_platforms"] = list(dict.fromkeys([
                            *(social.get("ad_platforms") or []), "meta",
                        ]))
                    social_changed = True
            elif f.field_name in _SOCIAL_FIELDS:
                key = _SOCIAL_FIELDS[f.field_name][0]
                value = _social_value(f.field_name, f.value)
                if value is not None:
                    social[key] = value
                    social_changed = True
            # preenche coluna real só se estiver vazia (não sobrescreve edição humana)
            if f.field_name in ENRICHABLE_FIELDS and f.value and not lead.get(f.field_name):
                column_updates[f.field_name] = f.value
                setattr(lead, f.field_name, f.value)  # reflete no objeto p/ match_rate

    rate = match_rate(lead)
    # persiste a cobertura de contatos (badge de "lead pobre" na fila/ficha)
    column_updates["match_rate"] = round(rate, 2)
    if social_changed:
        column_updates["social_signals"] = social
        setattr(lead, "social_signals", social)

    if column_updates:
        sink.update_lead_fields(lead.id, column_updates)

    new_status: LeadStatus = lead.status
    if advance_status:
        new_status = "enriquecido"
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
