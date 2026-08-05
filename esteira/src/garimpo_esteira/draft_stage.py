"""Estagio de rascunho (qualificado -> rascunho_pronto).

A IA escreve as 2 mensagens; o humano edita e aprova depois (no front). O
sistema NUNCA envia. Respeita opt-out (LGPD): lead opt-out nao gera copy de
contato, fica em 'qualificado'.
"""
from __future__ import annotations

import json
from datetime import datetime, timezone

from .draft.base import DraftProvider
from .sink.base import LeadSink


def draft_one(
    lead, provider: DraftProvider, sink: LeadSink, profession: str | None = None,
    reviews_source=None, sender_name: str | None = None, oab: str | None = None,
    legal_areas: list[str] | None = None, professional_gender: str | None = None,
) -> tuple[str, str] | None:
    if lead.opt_out:
        return None  # LGPD: nao rascunha contato pra quem pediu opt-out
    if profession:
        setattr(lead, "profession", profession)
    if sender_name:
        setattr(lead, "sender_name", sender_name)
    if oab:
        setattr(lead, "oab", oab)  # assinatura do e-mail (area de advocacia)
    if legal_areas:
        # areas de atuacao: definem COMO o advogado se apresenta na copy
        setattr(lead, "legal_areas", legal_areas)
    if professional_gender:
        # flexao de "advogado/advogada" na mensagem e na assinatura
        setattr(lead, "professional_gender", professional_gender)
    if reviews_source is not None:
        try:
            for f in reviews_source.enrich(lead):
                sink.record_provenance(lead.id, f.field_name, f.source, f.value, f.confidence)
                if f.field_name == "review_themes" and f.value:
                    try:
                        setattr(lead, "review_themes", json.loads(f.value))
                    except (ValueError, TypeError):
                        pass
        except Exception:
            pass
    msg1, msg2 = provider.generate(lead)
    fields = {
        "draft_msg1": msg1,
        "draft_msg2": msg2,
        "draft_model": provider.model,
        "draft_generated_at": datetime.now(timezone.utc).isoformat(),
    }
    # Canal extra da area de advocacia: e-mail formal. Opcional no provedor
    # (getattr) pra nao quebrar provider antigo, e nunca derruba o rascunho do
    # WhatsApp se a chamada falhar.
    gen_email = getattr(provider, "generate_email", None)
    if callable(gen_email):
        try:
            email = gen_email(lead)
        except Exception:
            email = None
        if email:
            fields["draft_email_subject"], fields["draft_email_body"] = email
    sink.update_lead_fields(lead.id, fields)
    if lead.status != "rascunho_pronto":
        sink.set_status(lead.id, "rascunho_pronto", actor="system", note=f"rascunho via {provider.model}")
    return msg1, msg2


def redraft_batch(
    sink: LeadSink, provider: DraftProvider, *, batch: int = 30,
    owner_id: str | None = None, profession: str | None = None,
    run_start: str | None = None, delay: float = 0.0,
    sender_name: str | None = None, oab: str | None = None,
    legal_areas: list[str] | None = None, professional_gender: str | None = None,
) -> int:
    """Re-rascunha leads em rascunho_pronto em lotes, sem alterar o status.

    run_start marca o inicio desta execucao. Para quando todos os leads ja
    buscados tiverem draft_generated_at >= run_start (ja refeitos nesta execucao).

    Reutiliza draft_one (re-gera copy, atualiza draft_generated_at; o guard de
    status em draft_one faz set_status virar no-op para rascunho_pronto).

    Opt-out: se draft_one retorna None, carimba draft_generated_at=run_start
    via sink.update_lead_fields para tirar o lead da fila (evita loop infinito).
    """
    import time

    if run_start is None:
        run_start = datetime.now(timezone.utc).isoformat()
    total = 0
    while True:
        leads = sink.fetch_redraft(batch, owner_id)
        # so processa leads ainda nao refeitos nesta execucao
        pend = [l for l in leads if not l.draft_generated_at or l.draft_generated_at < run_start]
        if not pend:
            break
        for i, lead in enumerate(pend):
            try:
                result = draft_one(
                    lead, provider, sink, profession,
                    sender_name=sender_name, oab=oab, legal_areas=legal_areas,
                    professional_gender=professional_gender,
                )
                if result is None:
                    # opt_out: carimba draft_generated_at para tirar da fila
                    sink.update_lead_fields(lead.id, {"draft_generated_at": run_start})
                else:
                    total += 1
            except Exception:
                pass
            if delay and i < len(pend) - 1:
                time.sleep(delay)
    return total


def draft_batch(
    sink: LeadSink, provider: DraftProvider, *, batch: int = 20, status="qualificado",
    owner_id: str | None = None, profession: str | None = None,
    reviews_source=None, sender_name: str | None = None,
    oab: str | None = None, legal_areas: list[str] | None = None,
    professional_gender: str | None = None,
) -> list[tuple[str, tuple[str, str]]]:
    """oab e legal_areas nao sao opcionais de verdade na area de advocacia: sem
    eles a copy cai no generico e o e-mail sai sem a assinatura da OAB. Ficam
    com default None so pra nao quebrar quem chama pelas outras areas."""
    leads = sink.fetch_by_status(status, batch, owner_id)
    out: list[tuple[str, tuple[str, str]]] = []
    for lead in leads:
        result = draft_one(
            lead, provider, sink, profession,
            reviews_source=reviews_source, sender_name=sender_name,
            oab=oab, legal_areas=legal_areas,
            professional_gender=professional_gender,
        )
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
