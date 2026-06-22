"""Limpa redes sociais bugadas nos leads ja gravados:
- instagram lixo (path interno tipo "_n", handle < 3 chars) -> null
- website que e, na verdade, um link de Instagram/Facebook -> move o @ certo pra
  instagram/facebook e zera o website (nao e site de verdade).
Roda pra todos os donos. Idempotente. Uso: python scripts/clean_social.py
"""
from __future__ import annotations

import os

import httpx

from garimpo_esteira.sources.website import _ig_ok, extract_facebook, ig_handle_from_url
from garimpo_esteira.validation import clean

URL = os.environ["SUPABASE_URL"].rstrip("/") + "/rest/v1"
KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
H = {"apikey": KEY, "Authorization": f"Bearer {KEY}", "Content-Type": "application/json"}
client = httpx.Client(timeout=30.0, headers=H)


def fetch_all() -> list[dict]:
    out, step, off = [], 1000, 0
    while True:
        r = client.get(f"{URL}/leads", params={
            "select": "id,instagram,facebook,website",
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
    print(f"{len(rows)} leads", flush=True)
    ig_fixed = ig_nulled = site_moved = 0
    for row in rows:
        patch: dict = {}
        ig = (row.get("instagram") or "").strip()
        site = (row.get("website") or "").strip()

        # 1) instagram lixo -> null
        if ig:
            h = ig.lstrip("@").strip("/.").lower()
            if not _ig_ok(h):
                patch["instagram"] = None
                ig_nulled += 1

        # 2) website que e link de rede social -> move e zera o site
        low = site.lower()
        if "instagram.com/" in low:
            h = ig_handle_from_url(site)
            patch["website"] = None
            if h and (patch.get("instagram") is None or not row.get("instagram")):
                patch["instagram"] = h
                ig_fixed += 1
            site_moved += 1
        elif "facebook.com/" in low or "fb.com/" in low:
            fb = extract_facebook(site)
            patch["website"] = None
            if fb and not row.get("facebook"):
                patch["facebook"] = fb
            site_moved += 1

        if patch:
            client.patch(f"{URL}/leads", params={"id": f"eq.{row['id']}"}, json=patch).raise_for_status()

    print(f"OK: instagram lixo zerado={ig_nulled}, site->social movido={site_moved}, "
          f"instagram recuperado da URL={ig_fixed}", flush=True)


if __name__ == "__main__":
    main()
