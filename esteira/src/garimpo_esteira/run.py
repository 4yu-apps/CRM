"""CLI da esteira. Roda agendado no GitHub Actions ou na mão.

  python -m garimpo_esteira.run seed-demo --sink jsonfile --json /tmp/garimpo.json
  python -m garimpo_esteira.run enrich    --sink jsonfile --json /tmp/garimpo.json --sources fixture --delay 0
  python -m garimpo_esteira.run enrich    --sink supabase            # usa env (.env)
"""
from __future__ import annotations

import argparse
import json
from pathlib import Path

from .cascade import enrich_batch
from .config import FIXTURES_DIR, Config, build_provider, build_sink, build_sources
from .draft_stage import draft_batch
from .models import Lead
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
    print(f"draft · sink={cfg.sink} llm={cfg.llm} ({provider.model}) batch={cfg.batch}")
    results = draft_batch(sink, provider, batch=cfg.batch)
    if not results:
        print("  nada para rascunhar (status=qualificado vazio)")
        return 0
    for lead_id, (msg1, _msg2) in results:
        print(f"  {lead_id}: {msg1[:70]}…")
    print(f"resumo: {len(results)} rascunhos prontos")
    _print_counts(sink)
    return 0


def cmd_pipeline(cfg: Config) -> int:
    """enrich -> score -> draft em sequência (bruto ... -> rascunho_pronto)."""
    print("pipeline: enrich -> score -> draft")
    cmd_enrich(cfg)
    cmd_score(cfg)
    cmd_draft(cfg)
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
    for name in ("seed-demo", "enrich", "score", "draft", "pipeline", "counts"):
        sp = sub.add_parser(name)
        sp.add_argument("--sink", choices=["jsonfile", "supabase"])
        sp.add_argument("--json")
        sp.add_argument("--sources", choices=["real", "fixture"])
        sp.add_argument("--llm", choices=["mock", "gemini"])
        sp.add_argument("--batch", type=int)
        sp.add_argument("--delay", type=float)

    args = p.parse_args(argv)
    cfg = _apply_overrides(Config.from_env(), args)

    dispatch = {
        "seed-demo": cmd_seed_demo,
        "enrich": cmd_enrich,
        "score": cmd_score,
        "draft": cmd_draft,
        "pipeline": cmd_pipeline,
        "counts": cmd_counts,
    }
    return dispatch[args.cmd](cfg)


if __name__ == "__main__":
    raise SystemExit(main())
