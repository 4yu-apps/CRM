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

import random
import re
import unicodedata
from collections.abc import Sequence

# Pool pra o modo aleatorio: quando o perfil pede nichos extras por run, a
# esteira sorteia daqui os que ainda nao foram varridos. Da variedade sem o
# dono precisar escolher.
DEFAULT_NICHE_POOL = [
    "estetica", "barbearia", "odontologia", "hamburgueria", "academia",
    "petshop", "restaurante", "cafeteria", "pizzaria", "salao de beleza",
    "clinica de estetica", "pilates", "lanchonete", "manicure", "tatuagem",
    "loja de roupas", "otica", "farmacia", "auto center", "clinica veterinaria",
]

from .discovery import result_to_lead
from .draft.base import DraftProvider
from .draft_stage import draft_batch
from .pipeline_stream import run_pipeline_streaming
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


def search_term(
    niche: str,
    city: str | None,
    state: str | None,
    neighborhood: str | None = None,
) -> str:
    """Monta a busca sem ambiguidade: 'nicho em [Bairro,] Cidade, UF'.

    Quando o dono escolhe um bairro, ele entra no termo pra focar a descoberta
    naquela regiao; sem bairro, varre a cidade toda como antes.
    """
    where = ", ".join(p for p in (neighborhood, city, state) if p)
    return f"{niche} em {where}" if where else niche


def generate_terms(
    niches: Sequence[str],
    city: str | None,
    state: str | None,
    neighborhood: str | None = None,
) -> list[tuple[str, str]]:
    """(niche, termo) por nicho do perfil."""
    return [(n, search_term(n, city, state, neighborhood)) for n in niches if n]


def run_autopilot(
    sink: LeadSink,
    maps_source,
    provider: DraftProvider,
    sources: Sequence[Source],
    *,
    batch: int = 20,
    delay: float = 0.0,
    skip_covered: bool = True,
    extra_niches: int = 0,
    rng: random.Random | None = None,
    reviews_source=None,
    workers: int = 1,
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
        neighborhood = prof.get("neighborhood")
        profession = prof.get("profession")  # define a lente do score e a copy
        professions = list(prof.get("professions") or ([profession] if profession else []))
        min_score = int(prof.get("min_score") or 0)  # #19 piso de score por dono
        rkey = region_key(city, state)
        covered = (
            {(rk, slug(nn)) for rk, nn in sink.fetch_covered_keys(owner)}
            if skip_covered
            else set()
        )

        niches = list(prof.get("niches") or [])
        if extra_niches > 0:
            r = rng or random
            usados = {slug(n) for n in niches}
            pool = [
                n for n in DEFAULT_NICHE_POOL
                if slug(n) not in usados and (rkey, slug(n)) not in covered
            ]
            r.shuffle(pool)
            niches = niches + pool[:extra_niches]

        discovered = 0
        for niche, term in generate_terms(niches, city, state, neighborhood):
            if (rkey, slug(niche)) in covered:
                continue  # zona+nicho ja varridos: nunca repete

            try:
                inserted = 0
                lats: list[float] = []
                lngs: list[float] = []
                for raw in maps_source.search(term):
                    lat = raw.get("lat")
                    lng = raw.get("lng")
                    if lat is not None and lng is not None:
                        lats.append(float(lat))
                        lngs.append(float(lng))
                    lead, findings = result_to_lead(raw, owner)
                    lead_id = sink.insert_lead(lead)
                    if not lead_id:  # dedup
                        continue
                    inserted += 1
                    for f in findings:
                        sink.record_provenance(lead_id, f.field_name, f.source, f.value, f.confidence)
            except Exception:
                # Maps/sink instavel num nicho nao aborta os outros nichos.
                continue

            center_lat = sum(lats) / len(lats) if lats else None
            center_lng = sum(lngs) / len(lngs) if lngs else None
            # pct: estimativa de cobertura baseada no volume (cap de 100).
            # Cada pagina do Places traz ~20 resultados; 3 paginas = ~60.
            # Qualquer retorno ja vale como "varredura iniciada" (minimo 10%).
            pct = min(100.0, inserted * 5.0) if inserted else 0.0

            discovered += inserted
            sink.upsert_coverage(
                owner, rkey, niche,
                region_name=(neighborhood or city or None),
                result_count=inserted,
                center_lat=center_lat,
                center_lng=center_lng,
                pct=pct,
            )
            if inserted:
                sink.log_activity(
                    owner,
                    "busca",
                    f"Varri {niche} em {neighborhood or city or 'sua regiao'} e achei {inserted} negocios novos",
                    ref_count=inserted,
                )

        # Pipeline escopado a este dono (nao toca leads de outros usuarios).
        # STREAMING lead-a-lead nos leads novos (bruto): cada um cai na fila
        # assim que fica pronto. Erro isolado por lead; erro de um dono nao
        # bloqueia os proximos. Mop-up depois (score_batch + draft_batch)
        # recupera stragglers deixados em enriquecido/qualificado por algum run
        # anterior interrompido — normalmente vazio (no-op).
        try:
            run_pipeline_streaming(
                sink, sources, provider, batch=batch, delay=delay, owner_id=owner,
                profession=profession, professions=professions,
                min_score=min_score, reviews_source=reviews_source, workers=workers,
            )
            score_batch(sink, batch=batch, owner_id=owner, profession=profession,
                        professions=professions, min_score=min_score)
            draft_batch(sink, provider, batch=batch, owner_id=owner, profession=profession, reviews_source=reviews_source)
        except Exception:
            pass

        summary.append({"owner_id": owner, "discovered": discovered})

    return summary


def run_drain(
    sink: LeadSink,
    sources: Sequence[Source],
    provider: DraftProvider,
    *,
    batch: int = 20,
    delay: float = 0.0,
    workers: int = 1,
    reviews_source=None,
) -> list[dict]:
    """Processa leads pendentes (bruto/enriquecido/qualificado) de TODO dono que
    tenha pendencia, com a profissao dele. E o que faz a captura da extensao (e
    qualquer lead parado) virar rascunho mesmo pra quem NAO tem autopilot ligado.

    Por dono: streaming dos novos (bruto) + mop-up (score/draft) pros que ja
    estavam no meio. Erro de um dono nao bloqueia os outros.
    """
    if not hasattr(sink, "fetch_pending_owners"):
        return []
    summary: list[dict] = []
    for owner in sink.fetch_pending_owners():
        prof = (sink.fetch_profile(owner) or {}) if hasattr(sink, "fetch_profile") else {}
        profession = prof.get("profession")
        professions = list(prof.get("professions") or ([profession] if profession else []))
        min_score = int(prof.get("min_score") or 0)
        try:
            counts = run_pipeline_streaming(
                sink, sources, provider, batch=batch, delay=delay, owner_id=owner,
                profession=profession, professions=professions, min_score=min_score,
                reviews_source=reviews_source, workers=workers,
            )
            # mop-up: termina quem ficou em enriquecido/qualificado de runs anteriores
            score_batch(sink, batch=batch, owner_id=owner, profession=profession,
                        professions=professions, min_score=min_score)
            draft_batch(sink, provider, batch=batch, owner_id=owner, profession=profession,
                        reviews_source=reviews_source)
            summary.append({"owner_id": owner, **counts})
        except Exception:
            pass
    return summary
