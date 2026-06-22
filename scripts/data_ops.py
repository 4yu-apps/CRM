"""One-off: backfill de site_signals + reanalise (4yumkt) + copia/analise design (gab).

Idempotente e reversivel:
- backfill: grava site_signals/match_rate (so calcula, nao apaga contato).
- 4yumkt: re-pontua na lente "auto"; ARQUIVA (archived=true, reversivel) os
  que ficam abaixo do corte E ainda estao em estagio inicial. Nunca toca leads
  que avancaram (enviado+) nem ja arquivados.
- gab (design): copia cada lead do 4yumkt pro owner do gab (dedup por
  maps_place_id), pontua na lente design e grava status qualificado/descartado.

Uso: python scripts/data_ops.py [--dry-run] [--limit N]
Le SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY do ambiente (carregue o .env antes).
"""
from __future__ import annotations

import dataclasses
import json
import os
import sys

import httpx

from garimpo_esteira.match_rate import match_rate
from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import THRESHOLD, score_lead
from garimpo_esteira.sources.website import extract_site_signals, http_fetch_html

OWNER_4YU = "b733cfa3-4c15-4056-b6d6-eebb631e792c"
OWNER_GAB = "eba30f40-4752-4c3a-80bd-9aaa3c1dff27"

DRY = "--dry-run" in sys.argv
LIMIT = None
if "--limit" in sys.argv:
    LIMIT = int(sys.argv[sys.argv.index("--limit") + 1])

URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
client = httpx.Client(timeout=30.0, headers=H)

_LEAD_FIELDS = {f.name for f in dataclasses.fields(Lead)}
# estagios iniciais onde arquivar um lead fraco e seguro (nao mexe no que avancou)
_EARLY = {"bruto", "enriquecido", "qualificado", "rascunho_pronto"}
# campos copiados pro gab (o resto e do robo: score, status, etc.)
_COPY = (
    "business_name", "cnpj", "phone", "whatsapp", "email", "instagram", "facebook",
    "website", "maps_place_id", "maps_url", "rating", "reviews_count", "category",
    "address", "neighborhood", "city", "state", "owner_name", "site_signals",
)


def fetch_all(owner: str) -> list[dict]:
    out: list[dict] = []
    step, off = 1000, 0
    while True:
        r = client.get(f"{URL}/leads", params={
            "owner_id": f"eq.{owner}", "select": "*",
            "limit": str(step), "offset": str(off), "order": "created_at.asc",
        })
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < step:
            break
        off += step
    return out


def row_to_lead(row: dict) -> Lead:
    return Lead(**{k: row.get(k) for k in _LEAD_FIELDS if k in row})


def patch_lead(lead_id: str, fields: dict) -> None:
    if DRY:
        return
    r = client.patch(f"{URL}/leads", params={"id": f"eq.{lead_id}"}, json=fields)
    r.raise_for_status()


def insert_leads(rows: list[dict]) -> None:
    if DRY or not rows:
        return
    r = client.post(f"{URL}/leads", json=rows)
    if r.status_code >= 400:
        print(f"INSERT 400 body: {r.text[:500]}", flush=True)
        print(f"sample payload keys: {sorted(rows[0].keys())}", flush=True)
    r.raise_for_status()


def backfill_signals(lead: Lead) -> dict | None:
    """Busca o HTML e extrai site_signals. Reusa se ja tiver. None se sem site."""
    if getattr(lead, "site_signals", None):
        return lead.site_signals
    site = (lead.website or "").strip()
    if not site:
        return None
    url = site if site.startswith(("http://", "https://")) else "https://" + site
    html = http_fetch_html(url)
    if not html:
        return None
    return extract_site_signals(html, url=url)


def main() -> None:
    leads_4yu = fetch_all(OWNER_4YU)
    if LIMIT:
        leads_4yu = leads_4yu[:LIMIT]
    print(f"4yumkt: {len(leads_4yu)} leads", flush=True)

    # gab: place_ids ja existentes (dedup)
    gab_existing = fetch_all(OWNER_GAB)
    gab_place_ids = {r.get("maps_place_id") for r in gab_existing if r.get("maps_place_id")}
    print(f"gab: {len(gab_existing)} leads existentes", flush=True)

    n_backfill = 0
    n_arquivados = 0
    gab_keep = 0
    gab_drop = 0
    gab_skip = 0
    to_insert: list[dict] = []

    for i, row in enumerate(leads_4yu):
        lead = row_to_lead(row)

        # 1) backfill site_signals (so calcula; grava na coluna)
        sig = backfill_signals(lead)
        updates: dict = {}
        if sig and not row.get("site_signals"):
            lead.site_signals = sig
            updates["site_signals"] = sig
            n_backfill += 1
        elif sig:
            lead.site_signals = sig
        rate = match_rate(lead)
        updates["match_rate"] = round(rate, 2)

        # 2) reanalise 4yumkt (lente auto: profession=None)
        ads = None
        if sig:
            ads = True if (sig.get("has_fb_pixel") or sig.get("has_google_tag")) else None
        res = score_lead(lead, {"ads_active": ads, "site": sig or {}}, None)
        updates["score"] = res.score
        updates["score_reason"] = res.reason
        # arquiva (reversivel) os fracos ainda em estagio inicial
        archive = (res.decision == "descartado" and row.get("status") in _EARLY
                   and not row.get("archived"))
        if archive:
            updates["archived"] = True
            n_arquivados += 1
        patch_lead(row["id"], updates)

        # 3) copia pro gab com analise DESIGN
        pid = row.get("maps_place_id")
        if pid and pid in gab_place_ids:
            gab_skip += 1
        else:
            d = score_lead(lead, {"site": sig or {}}, "design")
            status = "qualificado" if d.decision == "qualificado" else "descartado"
            if d.decision == "qualificado":
                gab_keep += 1
            else:
                gab_drop += 1
            # chaves uniformes em TODAS as linhas (PostgREST exige no insert em lote)
            new = {k: row.get(k) for k in _COPY}
            new.update({
                "owner_id": OWNER_GAB,
                "status": status,
                "score": d.score,
                "score_reason": d.reason,
                "service_target": "indefinido",
                "match_rate": round(rate, 2),
            })
            if pid:
                gab_place_ids.add(pid)
            to_insert.append(new)

        if (i + 1) % 50 == 0:
            print(f"  ...{i + 1}/{len(leads_4yu)} (backfill {n_backfill}, "
                  f"arquivar {n_arquivados}, gab keep {gab_keep}/drop {gab_drop})", flush=True)

    # insere os do gab em lotes
    for j in range(0, len(to_insert), 200):
        insert_leads(to_insert[j:j + 200])

    print("\n=== RESUMO ===", flush=True)
    print(f"{'[DRY-RUN] ' if DRY else ''}backfill site_signals: {n_backfill}", flush=True)
    print(f"4yumkt arquivados (fracos): {n_arquivados} de {len(leads_4yu)}", flush=True)
    print(f"gab copiados: keep(qualificado)={gab_keep}, drop(descartado)={gab_drop}, "
          f"skip(dedup)={gab_skip}", flush=True)


if __name__ == "__main__":
    main()
