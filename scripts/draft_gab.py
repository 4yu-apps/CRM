"""Gera a copy de DESIGN (mock, gratis) pros leads 'qualificado' do gab e os
avanca pra 'rascunho_pronto', deixando o funil do gab utilizavel. Idempotente:
so pega quem ainda esta em 'qualificado'.

Uso: python scripts/draft_gab.py   (carregue o .env antes)
"""
from __future__ import annotations

import dataclasses
import os
from datetime import datetime, timezone

import httpx

from garimpo_esteira.draft.mock import MockDraftProvider
from garimpo_esteira.models import Lead

OWNER_GAB = "eba30f40-4752-4c3a-80bd-9aaa3c1dff27"
URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
client = httpx.Client(timeout=30.0, headers=H)
_FIELDS = {f.name for f in dataclasses.fields(Lead)}
provider = MockDraftProvider()


def fetch_qualificado() -> list[dict]:
    out, step, off = [], 1000, 0
    while True:
        r = client.get(f"{URL}/leads", params={
            "owner_id": f"eq.{OWNER_GAB}", "status": "eq.qualificado",
            "select": "*", "limit": str(step), "offset": str(off),
        })
        r.raise_for_status()
        rows = r.json()
        out += rows
        if len(rows) < step:
            break
        off += step
    return out


def main() -> None:
    rows = fetch_qualificado()
    print(f"gab qualificado: {len(rows)}", flush=True)
    done = 0
    for row in rows:
        lead = Lead(**{k: row.get(k) for k in _FIELDS if k in row})
        setattr(lead, "profession", "design")  # lente de copy = design
        msg1, msg2 = provider.generate(lead)
        client.patch(f"{URL}/leads", params={"id": f"eq.{row['id']}"}, json={
            "draft_msg1": msg1,
            "draft_msg2": msg2,
            "draft_model": "mock",
            "draft_generated_at": datetime.now(timezone.utc).isoformat(),
            "status": "rascunho_pronto",
        }).raise_for_status()
        done += 1
        if done % 100 == 0:
            print(f"  ...{done}/{len(rows)}", flush=True)
    print(f"OK: {done} leads do gab agora em rascunho_pronto com copy de design", flush=True)


if __name__ == "__main__":
    main()
