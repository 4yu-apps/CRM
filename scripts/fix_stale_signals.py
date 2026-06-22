"""Corrige a contradicao "Nao tem site" x sinais dizendo "tem site".

Quando o "site" do Maps era na verdade um Instagram/Facebook, o clean_social
moveu pro campo certo e zerou o website, MAS os site_signals (extraidos daquela
pagina de rede social, lixo) e o score_reason ficaram velhos dizendo "tem site".
Aqui: para todo lead com website NULL e site_signals != NULL, zera os sinais e
re-pontua na lente da profissao do dono (sem site = oportunidade real). Recalcula
o valor sugerido. Nao mexe no status.

Uso: python scripts/fix_stale_signals.py   (carregue o .env antes)
"""
from __future__ import annotations

import dataclasses
import os

import httpx

from garimpo_esteira.models import Lead
from garimpo_esteira.pricing import suggest_value
from garimpo_esteira.scoring import score_lead

URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
client = httpx.Client(timeout=30.0, headers=H)
_FIELDS = {f.name for f in dataclasses.fields(Lead)}


def owner_professions() -> dict[str, str | None]:
    r = client.get(f"{URL}/search_profile", params={"select": "owner_id,profession"})
    r.raise_for_status()
    return {row["owner_id"]: row.get("profession") for row in r.json()}


def fetch_stale() -> list[dict]:
    out, step, off = [], 1000, 0
    while True:
        r = client.get(f"{URL}/leads", params={
            "website": "is.null", "site_signals": "not.is.null",
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
    profs = owner_professions()
    rows = fetch_stale()
    print(f"leads com site_signals velho (website null): {len(rows)}", flush=True)
    done = 0
    for row in rows:
        lead = Lead(**{k: row.get(k) for k in _FIELDS if k in row})
        lead.site_signals = None  # sinais invalidos sem site
        profession = profs.get(row.get("owner_id"))
        res = score_lead(lead, {"site": {}}, profession)
        fields: dict = {
            "site_signals": None,
            "service_target": res.service_target,
            "score": res.score,
            "score_reason": res.reason,
        }
        if res.decision == "qualificado":
            value, reason = suggest_value(
                res.service_target, lead.reviews_count, lead.rating, category=lead.category, stack=None,
            )
            fields["suggested_value"] = value
            fields["suggested_value_reason"] = reason
        client.patch(f"{URL}/leads", params={"id": f"eq.{row['id']}"}, json=fields).raise_for_status()
        done += 1
        if done % 100 == 0:
            print(f"  ...{done}/{len(rows)}", flush=True)
    print(f"OK: {done} leads re-pontuados sem o sinal de site falso", flush=True)


if __name__ == "__main__":
    main()
