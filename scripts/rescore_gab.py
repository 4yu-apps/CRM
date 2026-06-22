"""Re-pontua os leads do gab na lente DESIGN: agora que service_target ganhou
'design', amarra o alvo (badge) e recalcula o valor sugerido com a tabela de
projeto (site/e-commerce) em vez da de trafego. Nao mexe no status.

Uso: python scripts/rescore_gab.py   (carregue o .env antes)
"""
from __future__ import annotations

import dataclasses
import os

import httpx

from garimpo_esteira.models import Lead
from garimpo_esteira.pricing import suggest_value
from garimpo_esteira.scoring import score_lead

OWNER_GAB = "eba30f40-4752-4c3a-80bd-9aaa3c1dff27"
URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
client = httpx.Client(timeout=30.0, headers=H)
_FIELDS = {f.name for f in dataclasses.fields(Lead)}


def fetch_all() -> list[dict]:
    out, step, off = [], 1000, 0
    while True:
        r = client.get(f"{URL}/leads", params={
            "owner_id": f"eq.{OWNER_GAB}", "select": "*",
            "limit": str(step), "offset": str(off),
        })
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < step:
            break
        off += step
    return out


def main() -> None:
    rows = fetch_all()
    print(f"gab: {len(rows)} leads", flush=True)
    done = 0
    for row in rows:
        lead = Lead(**{k: row.get(k) for k in _FIELDS if k in row})
        sig = getattr(lead, "site_signals", None) or {}
        res = score_lead(lead, {"site": sig}, "design")
        fields: dict = {
            "service_target": res.service_target,  # "design" (ou "indefinido" se descartado)
            "score": res.score,
            "score_reason": res.reason,
        }
        if res.decision == "qualificado":
            value, reason = suggest_value(
                res.service_target, lead.reviews_count, lead.rating,
                category=lead.category, stack=sig.get("stack"),
            )
            fields["suggested_value"] = value
            fields["suggested_value_reason"] = reason
        client.patch(f"{URL}/leads", params={"id": f"eq.{row['id']}"}, json=fields).raise_for_status()
        done += 1
        if done % 100 == 0:
            print(f"  ...{done}/{len(rows)}", flush=True)
    print(f"OK: {done} leads do gab re-amarrados na lente design", flush=True)


if __name__ == "__main__":
    main()
