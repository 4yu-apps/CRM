"""Pipeline streaming lead-a-lead: cada lead descoberto passa por
enrich -> score -> draft INTEIRO e cai na fila (rascunho_pronto) assim que fica
pronto — em vez de processar todos no enrich, depois todos no score, depois
todos no draft (paredes por estagio, fila so enche no fim).

Reaproveita as funcoes por-item (enrich_lead, score_one, draft_one), que ja
gravam no banco por lead; muda so a ordem de orquestracao: de "estagio-major"
para "lead-major". Isola erro POR LEAD: um lead que estoura nao impede os demais
de entrarem na fila. Idempotente: so processa quem esta em 'bruto'; os guards de
status nas funcoes reusadas evitam retroceder/reprocessar.
"""
from __future__ import annotations

import time
from collections.abc import Sequence

from .cascade import enrich_lead
from .draft.base import DraftProvider
from .draft_stage import draft_one
from .models import LeadStatus
from .score_stage import score_one
from .sink.base import LeadSink
from .sources.base import Source


def process_one_lead(
    lead, sources: Sequence[Source], provider: DraftProvider, sink: LeadSink, *,
    profession: str | None = None, min_score: int = 0, reviews_source=None,
    professions: list[str] | None = None,
) -> dict:
    """Roda enrich -> score -> draft para UM lead. Retorna o que aconteceu:
    {"enriched": bool, "discarded": bool, "drafted": bool}."""
    enrich_lead(lead, sources, sink)  # bruto -> enriquecido
    result = score_one(lead, sink, profession, min_score, professions=professions)  # -> qualificado | descartado
    drafted = False
    if result.decision == "qualificado":
        if draft_one(lead, provider, sink, profession, reviews_source=reviews_source):
            drafted = True  # -> rascunho_pronto (entra na fila agora)
    return {
        "enriched": True,
        "discarded": result.decision == "descartado",
        "drafted": drafted,
    }


def run_pipeline_streaming(
    sink: LeadSink, sources: Sequence[Source], provider: DraftProvider, *,
    batch: int = 20, delay: float = 0.0, owner_id: str | None = None,
    profession: str | None = None, min_score: int = 0, reviews_source=None,
    status: LeadStatus = "bruto", workers: int = 1, professions: list[str] | None = None,
) -> dict:
    """Busca leads 'bruto' (ordem de descoberta: created_at.asc) e processa cada
    um por inteiro, com try/except POR LEAD. Acumula as contagens e emite no fim
    os mesmos eventos de atividade do pipeline batch (enriquecimento/descarte/
    rascunho) com os totais — feed da home inalterado.

    workers>1 processa varios leads em paralelo (I/O-bound: a maior parte do
    tempo e HTTP de site/cnpj/etc.). Cada lead so toca o proprio lead_id, e o
    SupabaseSink e thread-safe (httpx.Client compartilhado + retry/backoff em
    429/5xx), entao concorrencia limitada acelera ~Nx sem corromper nada. Os
    leads continuam caindo na fila um a um conforme terminam (streaming). Use
    workers=1 com o JsonFileSink (offline/teste), que nao e thread-safe."""
    leads = sink.fetch_by_status(status, batch, owner_id)
    counts = {"enriched": 0, "discarded": 0, "drafted": 0}

    def _work(lead) -> dict:
        return process_one_lead(
            lead, sources, provider, sink,
            profession=profession, min_score=min_score, reviews_source=reviews_source,
            professions=professions,
        )

    def _tally(r) -> None:
        for k in counts:
            counts[k] += int(r[k])

    if workers and workers > 1 and len(leads) > 1:
        from concurrent.futures import ThreadPoolExecutor

        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = [pool.submit(_work, lead) for lead in leads]
            for fut in futures:  # tally na thread principal; counts sem corrida
                try:
                    _tally(fut.result())
                except Exception:
                    pass
    else:
        for i, lead in enumerate(leads):
            try:
                _tally(_work(lead))
            except Exception:
                # lead ruim fica no status atual; proximo run (mop-up do autopilot
                # ou crons redraft/backfill) retenta. Nunca derruba o resto do lote.
                pass
            if delay and i < len(leads) - 1:
                time.sleep(delay)

    log_owner = owner_id or (leads[0].owner_id if leads else "") or ""
    _log_pipeline_activity(sink, log_owner, counts)
    return counts


def _log_pipeline_activity(sink: LeadSink, owner_id: str, counts: dict) -> None:
    """Emite os eventos de atividade do feed com os totais agregados. Cada um e
    nao-bloqueante (falha de log nao derruba o pipeline)."""
    events = [
        ("enriquecimento", counts["enriched"],
         f"Enriqueci {counts['enriched']} negocios com telefone, redes e site"),
        ("descarte", counts["discarded"],
         f"Descartei {counts['discarded']} que nao batem com o perfil"),
        ("rascunho", counts["drafted"],
         f"Escrevi a abordagem de {counts['drafted']} leads, prontos pra voce revisar"),
    ]
    for tipo, n, text in events:
        if n <= 0:
            continue
        try:
            sink.log_activity(owner_id, tipo, text, ref_count=n)
        except Exception:
            pass
