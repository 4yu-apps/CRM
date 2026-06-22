"""purge_gringo.py - Remove leads estrangeiros do banco Supabase.

Identifica leads fora do Brasil usando geo.looks_foreign(state, address).
Telefone invalido sozinho NAO e criterio de exclusao: so reforca quando
state ou address ja indicam origem estrangeira.

Uso:
    python scripts/purge_gringo.py            # dry-run (mostra, nao apaga)
    python scripts/purge_gringo.py --execute  # apaga de verdade

Variaveis de ambiente obrigatorias:
    SUPABASE_URL
    SUPABASE_SERVICE_ROLE_KEY

Variavel opcional:
    OWNER_USER_ID  - filtra apenas leads desse dono; sem ela, processa todos.
"""
from __future__ import annotations

import argparse
import os
import sys

# Garante que o src/ esta no path quando rodado como script avulso
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "src"))

import httpx

from garimpo_esteira.geo import looks_foreign

_PAGE = 1000  # registros por pagina (limite seguro do PostgREST)


def _headers(service_key: str) -> dict:
    return {
        "apikey": service_key,
        "Authorization": f"Bearer {service_key}",
        "Content-Type": "application/json",
        "Accept": "application/json",
        "Prefer": "count=exact",
    }


def fetch_all_leads(base: str, service_key: str, owner_id: str | None) -> list[dict]:
    """Busca todos os leads com state e address. Pagina de _PAGE em _PAGE."""
    hdrs = _headers(service_key)
    leads: list[dict] = []
    offset = 0
    while True:
        params: dict = {
            "select": "id,business_name,city,state,address",
            "offset": str(offset),
            "limit": str(_PAGE),
        }
        if owner_id:
            params["owner_id"] = f"eq.{owner_id}"
        r = httpx.get(f"{base}/leads", headers=hdrs, params=params, timeout=30.0)
        r.raise_for_status()
        page = r.json()
        if not page:
            break
        leads.extend(page)
        if len(page) < _PAGE:
            break
        offset += _PAGE
    return leads


def find_foreign(leads: list[dict]) -> list[dict]:
    """Retorna apenas os leads identificados como estrangeiros."""
    return [
        lead for lead in leads
        if looks_foreign(lead.get("state"), lead.get("address"))
    ]


def delete_leads(base: str, service_key: str, ids: list[str]) -> int:
    """Deleta os leads pelos ids. Retorna quantos foram deletados."""
    if not ids:
        return 0
    hdrs = _headers(service_key)
    # PostgREST aceita filtro por lista: ?id=in.(id1,id2,...)
    id_list = ",".join(f'"{i}"' for i in ids)
    r = httpx.delete(
        f"{base}/leads",
        headers={**hdrs, "Prefer": "count=exact"},
        params={"id": f"in.({id_list})"},
        timeout=60.0,
    )
    r.raise_for_status()
    # Content-Range: 0-N/total
    content_range = r.headers.get("Content-Range", "")
    try:
        return int(content_range.split("/")[-1])
    except (ValueError, IndexError):
        return len(ids)


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Remove leads estrangeiros do banco Supabase."
    )
    parser.add_argument(
        "--execute",
        action="store_true",
        default=False,
        help="Apaga os registros. Sem esta flag roda em dry-run (so imprime).",
    )
    args = parser.parse_args()
    dry_run = not args.execute

    supabase_url = os.getenv("SUPABASE_URL")
    service_key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    owner_id = os.getenv("OWNER_USER_ID")

    if not supabase_url or not service_key:
        sys.exit(
            "ERRO: defina SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no ambiente."
        )

    base = supabase_url.rstrip("/") + "/rest/v1"

    print("Buscando leads no banco...")
    leads = fetch_all_leads(base, service_key, owner_id)
    print(f"  Total carregado: {len(leads)}")

    foreign = find_foreign(leads)
    print(f"  Leads estrangeiros encontrados: {len(foreign)}")

    if not foreign:
        print("Nenhum lead estrangeiro. Nada a fazer.")
        return

    # Exibe amostra
    sample = foreign[:10]
    print("\nAmostra (ate 10):")
    for lead in sample:
        print(
            f"  {lead.get('business_name','(sem nome)')!r}"
            f" | city={lead.get('city')} | state={lead.get('state')}"
            f" | address={lead.get('address')}"
        )

    if dry_run:
        print(
            f"\nDRY-RUN: {len(foreign)} leads seriam apagados. "
            "Use --execute para apagar de verdade."
        )
        return

    ids = [str(lead["id"]) for lead in foreign]
    deleted = delete_leads(base, service_key, ids)
    print(f"\nApagados: {deleted} leads estrangeiros.")


if __name__ == "__main__":
    main()
