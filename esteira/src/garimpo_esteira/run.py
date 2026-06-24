"""CLI da esteira. Roda agendado no GitHub Actions ou na mão.

  python -m garimpo_esteira.run seed-demo --sink jsonfile --json /tmp/garimpo.json
  python -m garimpo_esteira.run enrich    --sink jsonfile --json /tmp/garimpo.json --sources fixture --delay 0
  python -m garimpo_esteira.run enrich    --sink supabase            # usa env (.env)
"""
from __future__ import annotations

import argparse
import json
import time
from datetime import datetime, timezone
from pathlib import Path

from .autopilot import region_key, run_autopilot, search_term
from .cascade import enrich_batch, enrich_lead
from .config import FIXTURES_DIR, Config, build_maps_source, build_provider, build_reviews_source, build_sink, build_sources
from .discovery import discover
from .draft_stage import draft_batch, redraft_batch
from .models import Lead
from .pipeline_stream import run_pipeline_streaming
from .score_stage import score_batch
from .validation import is_present

DEMO_OWNER = "00000000-0000-0000-0000-0000000000aa"


def _apply_overrides(cfg: Config, args: argparse.Namespace) -> Config:
    if args.sink:
        cfg.sink = args.sink
    if args.json:
        cfg.json_path = Path(args.json)
    if args.sources:
        cfg.sources_mode = args.sources
    if args.batch is not None:
        cfg.batch = args.batch
    if args.delay is not None:
        cfg.delay = args.delay
    if getattr(args, "llm", None):
        cfg.llm = args.llm
    if getattr(args, "maps", None):
        cfg.maps_mode = args.maps
    return cfg


def cmd_seed_demo(cfg: Config) -> int:
    sink = build_sink(cfg)
    raw_leads = json.loads((FIXTURES_DIR / "demo_leads.json").read_text("utf-8"))
    owner = cfg.owner_id or DEMO_OWNER
    inserted = 0
    for raw in raw_leads:
        if sink.insert_lead(Lead(id="", owner_id=owner, status="bruto", **raw)):
            inserted += 1
    print(f"seed-demo: {inserted}/{len(raw_leads)} inseridos (dedup ignora repetidos)")
    _print_counts(sink)
    return 0


def cmd_enrich(cfg: Config) -> int:
    sink = build_sink(cfg)
    sources = build_sources(cfg)
    print(f"enrich · sink={cfg.sink} sources={cfg.sources_mode} batch={cfg.batch} delay={cfg.delay}s")
    results = enrich_batch(sink, sources, batch=cfg.batch, delay=cfg.delay)
    if not results:
        print("  nada para enriquecer (status=bruto vazio)")
        return 0

    with_phone = 0
    for r in results:
        lead = sink.get_lead(r.lead_id)
        if lead and is_present("phone", lead.phone):
            with_phone += 1
        print(f"  {r.lead_id}: +{r.fields_filled or '—'} match={int(r.match_rate * 100)}% -> {r.new_status}")

    avg = sum(r.match_rate for r in results) / len(results)
    pct_phone = int(with_phone / len(results) * 100)
    print(f"resumo: {len(results)} leads · match medio {int(avg * 100)}% · com telefone {pct_phone}% (meta >=80%)")
    _print_counts(sink)
    return 0


def cmd_discover(cfg: Config, terms: list[str]) -> int:
    sink = build_sink(cfg)
    maps = build_maps_source(cfg)
    owner = cfg.owner_id or DEMO_OWNER
    print(f"discover · sink={cfg.sink} maps={cfg.maps_mode} termos={terms}")
    res = discover(sink, maps, terms, owner)
    print(f"  inseridos {res['inserted']} · ignorados (dedup) {res['skipped']}")
    _print_counts(sink)
    return 0


def cmd_score(cfg: Config) -> int:
    sink = build_sink(cfg)
    print(f"score · sink={cfg.sink} batch={cfg.batch}")
    results = score_batch(sink, batch=cfg.batch)
    if not results:
        print("  nada para pontuar (status=enriquecido vazio)")
        return 0
    for r in results:
        print(f"  score={r.score} -> {r.decision} ({r.reason['verdict']})")
    qual = sum(1 for r in results if r.decision == "qualificado")
    print(f"resumo: {len(results)} pontuados · {qual} qualificados · {len(results) - qual} descartados")
    _print_counts(sink)
    return 0


def cmd_draft(cfg: Config) -> int:
    sink = build_sink(cfg)
    provider = build_provider(cfg)
    reviews_source = build_reviews_source(cfg)
    print(f"draft · sink={cfg.sink} llm={cfg.llm} ({provider.model}) batch={cfg.batch}")
    results = draft_batch(sink, provider, batch=cfg.batch, reviews_source=reviews_source)
    if not results:
        print("  nada para rascunhar (status=qualificado vazio)")
        return 0
    for lead_id, (msg1, _msg2) in results:
        print(f"  {lead_id}: {msg1[:70]}…")
    print(f"resumo: {len(results)} rascunhos prontos")
    _print_counts(sink)
    return 0


def cmd_redraft(cfg: Config) -> int:
    sink = build_sink(cfg)
    provider = build_provider(cfg)
    print(f"redraft · sink={cfg.sink} llm={cfg.llm} ({provider.model}) batch={cfg.batch}")
    total = redraft_batch(sink, provider, batch=cfg.batch, delay=cfg.delay)
    if not total:
        print("  nada para re-rascunhar (sem rascunho_pronto pendente)")
        return 0
    print(f"redraft: {total} leads re-rascunhados com {provider.model}")
    _print_counts(sink)
    return 0


def cmd_pipeline(cfg: Config) -> int:
    """enrich -> score -> draft em sequência (bruto ... -> rascunho_pronto)."""
    print("pipeline: enrich -> score -> draft")
    cmd_enrich(cfg)
    cmd_score(cfg)
    cmd_draft(cfg)
    return 0


def cmd_autopilot(cfg: Config) -> int:
    """Multi-tenant: itera os perfis com autopilot, descobre (Maps) e roda o
    pipeline por dono. E o que enche a fila sozinho, sem PC ligado."""
    # Guarda: se for pra usar o Places real mas a chave ainda nao foi liberada,
    # nao quebra o cron nem injeta dado de fixture no banco real. So avisa.
    if cfg.maps_mode == "places" and not cfg.maps_key:
        print("autopilot: GARIMPO_MAPS=places sem GOOGLE_MAPS_API_KEY; descoberta pausada (nada a fazer).")
        return 0
    sink = build_sink(cfg)
    maps = build_maps_source(cfg)
    provider = build_provider(cfg)
    sources = build_sources(cfg)
    reviews_source = build_reviews_source(cfg)
    print(f"autopilot · sink={cfg.sink} maps={cfg.maps_mode} llm={cfg.llm}")
    # concorrencia so com o banco real (SupabaseSink e thread-safe); JsonFileSink
    # offline cai pra 1 worker.
    workers = cfg.workers if cfg.sink == "supabase" else 1
    summary = run_autopilot(
        sink, maps, provider, sources,
        batch=cfg.batch, delay=cfg.delay, extra_niches=cfg.extra_niches,
        reviews_source=reviews_source, workers=workers,
    )
    if not summary:
        print("  nenhum perfil com autopilot ligado (nada a fazer)")
    for s in summary:
        print(f"  owner {str(s['owner_id'])[:8]}: {s['discovered']} descobertos")
    _print_counts(sink)
    return 0


def cmd_search(
    cfg: Config, owner_id: str, niche: str, city: str | None,
    state: str | None, neighborhood: str | None,
) -> int:
    """Busca DIRECIONADA na hora, escopada a UM dono e ao endereco que ele
    digitou na tela Buscar (independe do flag autopilot). Descobre no Maps,
    enriquece, pontua (na lente da profissao do dono) e rascunha, tudo so pros
    leads desse dono. E o que faz o botao 'Buscar agora' funcionar de verdade."""
    if cfg.maps_mode == "places" and not cfg.maps_key:
        print("search: GARIMPO_MAPS=places sem GOOGLE_MAPS_API_KEY; descoberta pausada.")
        return 0
    if not owner_id or not niche:
        print("search: faltou owner ou niche (nada a fazer).")
        return 0

    sink = build_sink(cfg)
    maps = build_maps_source(cfg)
    provider = build_provider(cfg)
    sources = build_sources(cfg)
    reviews_source = build_reviews_source(cfg)
    term = search_term(niche, city, state, neighborhood)

    profession = None
    professions: list[str] = []
    min_score = 0
    if hasattr(sink, "fetch_profile"):
        try:
            prof = sink.fetch_profile(owner_id) or {}
            profession = prof.get("profession")
            professions = list(prof.get("professions") or ([profession] if profession else []))
            min_score = int(prof.get("min_score") or 0)
        except Exception:
            profession = None

    print(f"search · owner={owner_id[:8]} term={term!r} prof={','.join(professions) or '-'}")
    res = discover(sink, maps, [term], owner_id)
    inserted = int(res.get("inserted", 0))
    print(f"  descobertos {inserted} (dedup {res.get('skipped', 0)})")

    # pipeline so deste dono, STREAMING lead-a-lead: cada negocio passa por
    # enrich -> score (lente da profissao) -> draft inteiro e cai na fila assim
    # que fica pronto, em vez de esperar o lote todo. Fila enche de 1 em 1.
    # concorrencia so com o banco real (SupabaseSink e thread-safe); o JsonFileSink
    # offline nao e, entao cai pra 1 worker.
    workers = cfg.workers if cfg.sink == "supabase" else 1
    run_pipeline_streaming(
        sink, sources, provider,
        batch=cfg.batch, delay=cfg.delay, owner_id=owner_id,
        profession=profession, professions=professions,
        min_score=min_score, reviews_source=reviews_source,
        workers=workers,
    )

    # memoria de cobertura + feed de atividade do dono
    if hasattr(sink, "upsert_coverage"):
        try:
            sink.upsert_coverage(
                owner_id, region_key(city, state), niche,
                region_name=(neighborhood or city or None),
                result_count=inserted, pct=min(100.0, inserted * 5.0) if inserted else 0.0,
            )
        except Exception:
            pass
    try:
        sink.log_activity(
            owner_id, "busca",
            f"Varri {niche} em {neighborhood or city or 'sua regiao'} e achei {inserted} negocios novos",
            ref_count=inserted,
        )
    except Exception:
        pass
    _print_counts(sink)
    return 0


def _ads_from_prov(prov: list[dict]) -> bool | None:
    for p in prov:
        if p.get("field_name") == "ads_active":
            return p.get("value") == "sim"
    return None


def cmd_backfill(cfg: Config) -> int:
    """Completa leads JA avancados (rascunho_pronto etc.) que tem site mas
    ficaram sem facebook/instagram/whatsapp/ads_active — eles passaram pela
    esteira antes do enriquecimento+ existir. Re-raspa o site e checa a Meta SEM
    mexer no status. So preenche campo vazio; idempotente."""
    sink = build_sink(cfg)
    sources = build_sources(cfg)
    leads = sink.fetch_backfill(cfg.batch)
    print(f"backfill · sink={cfg.sink} sources={cfg.sources_mode} batch={cfg.batch} alvo={len(leads)}")
    if not leads:
        print("  nada pra completar (leads com site ja tem facebook/insta/whatsapp/ads)")
        return 0

    now_iso = datetime.now(timezone.utc).isoformat()
    filled = ads_yes = ads_no = 0
    for i, lead in enumerate(leads):
        try:
            res = enrich_lead(lead, sources, sink, advance_status=False)
            if res.fields_filled:
                filled += 1
            # ads_active vai pra proveniencia (como no pipeline); aqui promovemos
            # pra coluna do lead na hora, igual o estagio de score faz. E carimba
            # backfilled_at pra rotacao (proximo run pega outros leads).
            ads = _ads_from_prov(sink.fetch_provenance(lead.id))
            updates: dict[str, object] = {"backfilled_at": now_iso}
            if ads is not None:
                updates["ads_active"] = ads
                ads_yes += 1 if ads else 0
                ads_no += 0 if ads else 1
            sink.update_lead_fields(lead.id, updates)
            tag = "sim" if ads else "nao" if ads is False else "?"
            print(f"  {lead.id}: +{res.fields_filled or '—'} anuncia={tag}")
        except Exception as e:
            print(f"  {lead.id}: erro {e}")
        if cfg.delay and i < len(leads) - 1:
            time.sleep(cfg.delay)

    print(f"resumo: {len(leads)} processados · {filled} ganharam campo · "
          f"ja anuncia: {ads_yes} sim / {ads_no} nao / {len(leads) - ads_yes - ads_no} desconhecido")
    _print_counts(sink)
    return 0


def cmd_counts(cfg: Config) -> int:
    _print_counts(build_sink(cfg))
    return 0


def _print_counts(sink) -> None:
    if hasattr(sink, "counts"):
        print("  funil:", sink.counts())


def main(argv: list[str] | None = None) -> int:
    p = argparse.ArgumentParser(prog="garimpo-esteira")
    sub = p.add_subparsers(dest="cmd", required=True)
    for name in ("seed-demo", "discover", "enrich", "score", "draft", "redraft", "pipeline", "autopilot", "backfill", "counts", "search"):
        sp = sub.add_parser(name)
        sp.add_argument("--sink", choices=["jsonfile", "supabase"])
        sp.add_argument("--json")
        sp.add_argument("--sources", choices=["real", "fixture"])
        sp.add_argument("--llm", choices=["mock", "gemini"])
        sp.add_argument("--maps", choices=["fixture", "places"])
        sp.add_argument("--terms", help="termos de busca separados por virgula (discover)")
        sp.add_argument("--batch", type=int)
        sp.add_argument("--delay", type=float)
    # busca direcionada (tela Buscar): escopada a um dono + endereco digitado
    sp_search = sub.choices["search"]
    sp_search.add_argument("--owner", help="owner_id do dono que pediu a busca")
    sp_search.add_argument("--niche", help="ramo/nicho a buscar")
    sp_search.add_argument("--city")
    sp_search.add_argument("--state")
    sp_search.add_argument("--neighborhood")

    args = p.parse_args(argv)
    cfg = _apply_overrides(Config.from_env(), args)

    if args.cmd == "discover":
        terms = [t.strip() for t in (args.terms or "pizzaria").split(",") if t.strip()]
        return cmd_discover(cfg, terms)

    if args.cmd == "search":
        return cmd_search(cfg, args.owner, args.niche, args.city, args.state, args.neighborhood)

    dispatch = {
        "seed-demo": cmd_seed_demo,
        "enrich": cmd_enrich,
        "score": cmd_score,
        "draft": cmd_draft,
        "redraft": cmd_redraft,
        "pipeline": cmd_pipeline,
        "autopilot": cmd_autopilot,
        "backfill": cmd_backfill,
        "counts": cmd_counts,
    }
    return dispatch[args.cmd](cfg)


if __name__ == "__main__":
    raise SystemExit(main())
