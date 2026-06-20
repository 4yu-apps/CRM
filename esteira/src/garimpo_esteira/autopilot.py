"""Autopilot multi-tenant: descobre e processa por usuario, a partir do perfil.

Le os perfis com autopilot ligado, gera os termos de busca (nicho + cidade +
estado, sem ambiguidade entre cidades de mesmo nome), pula o que ja foi varrido
(memoria de cobertura), e roda o pipeline (enrich -> score -> draft) escopado a
cada dono. E o coracao da Fase 2: a esteira itera os perfis, nao um dono fixo.

A regiao (bairro) o sistema cobre sozinho: a localizacao do usuario e
estado + cidade, e a busca varre a cidade. O grid (grid.py) e a paginacao do
Places aprofundam a cobertura sem o usuario precisar conhecer os bairros.
"""
from __future__ import annotations

import re
import unicodedata
from collections.abc import Sequence

from .cascade import enrich_batch
from .discovery import result_to_lead
from .draft.base import DraftProvider
from .draft_stage import draft_batch
from .score_stage import score_batch
from .sink.base import LeadSink
from .sources.base import Source


def slug(text: str | None) -> str:
    """Normaliza pra chave/comparacao: sem acento, minusculo, so [a-z0-9-]."""
    base = unicodedata.normalize("NFKD", text or "")
    base = "".join(c for c in base if not unicodedata.combining(c))
    return re.sub(r"[^a-z0-9]+", "-", base.lower()).strip("-")


def region_key(city: str | None, state: str | None) -> str:
    """Chave estavel da regiao: cidade + estado.

    O estado entra pra desambiguar cidades de mesmo nome (ha varias 'Bom
    Jardim', 'Santa Maria' etc. em estados diferentes).
    """
    return slug(f"{city or ''} {state or ''}") or "sem-regiao"


def search_term(niche: str, city: str | None, state: str | None) -> str:
    """Monta a busca sem ambiguidade: 'nicho em Cidade, UF'."""
    where = ", ".join(p for p in (city, state) if p)
    return f"{niche} em {where}" if where else niche


def generate_terms(
    niches: Sequence[str], city: str | None, state: str | None
) -> list[tuple[str, str]]:
    """(niche, termo) por nicho do perfil."""
    return [(n, search_term(n, city, state)) for n in niches if n]


def run_autopilot(
    sink: LeadSink,
    maps_source,
    provider: DraftProvider,
    sources: Sequence[Source],
    *,
    batch: int = 20,
    delay: float = 0.0,
    skip_covered: bool = True,
) -> list[dict]:
    """Itera os perfis com autopilot ligado. Por dono: descobre (pulando o ja
    varrido) e roda o pipeline so nos leads dele. Retorna um resumo por dono.
    """
    profiles = sink.fetch_autopilot_profiles()
    summary: list[dict] = []

    for prof in profiles:
        owner = prof.get("owner_id")
        if not owner:
            continue
        city, state = prof.get("city"), prof.get("state")
        rkey = region_key(city, state)
        covered = (
            {(rk, slug(nn)) for rk, nn in sink.fetch_covered_keys(owner)}
            if skip_covered
            else set()
        )

        discovered = 0
        for niche, term in generate_terms(prof.get("niches") or [], city, state):
            if (rkey, slug(niche)) in covered:
                continue  # zona+nicho ja varridos: nunca repete

            inserted = 0
            for raw in maps_source.search(term):
                lead, findings = result_to_lead(raw, owner)
                lead_id = sink.insert_lead(lead)
                if not lead_id:  # dedup
                    continue
                inserted += 1
                for f in findings:
                    sink.record_provenance(lead_id, f.field_name, f.source, f.value, f.confidence)

            discovered += inserted
            sink.upsert_coverage(
                owner, rkey, niche, region_name=(city or None), result_count=inserted
            )
            if inserted:
                sink.log_activity(
                    owner,
                    "busca",
                    f"Varri {niche} em {city or 'sua regiao'} e achei {inserted} negocios novos",
                    ref_count=inserted,
                )

        # pipeline escopado a este dono (nao toca leads de outros usuarios)
        enrich_batch(sink, sources, batch=batch, delay=delay, owner_id=owner)
        score_batch(sink, batch=batch, owner_id=owner)
        draft_batch(sink, provider, batch=batch, owner_id=owner)

        summary.append({"owner_id": owner, "discovered": discovered})

    return summary
