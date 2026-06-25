#!/usr/bin/env python3
"""Carrega o subset da Receita (Dados Abertos) na tabela receita_estabelecimento.

OPERACIONAL: rode LOCAL (nao no cron). Baixe os zips de
https://dadosabertos.rfb.gov.br/CNPJ/ (Estabelecimentos*, Empresas*, Municipios)
e aponte este script pra eles. Ele filtra pelos municipios que voce prospecta e
faz upsert no Supabase (le SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do .env).

Exemplo:
  python scripts/load_receita.py --uf PR --cities "MARINGA,SARANDI" \
      --municipios Municipios.zip \
      --estab "Estabelecimentos*.zip" --empresas "Empresas*.zip"

Cada arquivo pode ser .zip (1 CSV dentro) ou .csv (latin-1, ;-sep, aspas).
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
import unicodedata
import zipfile
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "esteira" / "src"))
from garimpo_esteira.receita_load import (  # noqa: E402
    parse_empresas_razao,
    parse_estabelecimento,
    parse_municipios,
)

BATCH = 500


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.upper().split())


def _iter_lines(path: str):
    """Linhas (latin-1) de um .zip (1 CSV dentro) ou .csv."""
    if path.lower().endswith(".zip"):
        with zipfile.ZipFile(path) as z:
            for name in z.namelist():
                with z.open(name) as fh:
                    for raw in io_textwrap(fh):
                        yield raw
    else:
        with open(path, encoding="latin-1") as fh:
            for raw in fh:
                yield raw.rstrip("\n")


def io_textwrap(fh):
    for raw in fh:
        yield raw.decode("latin-1").rstrip("\n")


def _expand(patterns: list[str]) -> list[str]:
    out: list[str] = []
    for p in patterns:
        out.extend(sorted(glob.glob(p)))
    return out


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--uf", required=True)
    ap.add_argument("--cities", required=True, help="nomes separados por virgula")
    ap.add_argument("--municipios", required=True)
    ap.add_argument("--estab", nargs="+", required=True)
    ap.add_argument("--empresas", nargs="+", required=True)
    args = ap.parse_args()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("defina SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (.env)")
        return 1

    uf = args.uf.upper()
    wanted_cities = {_norm(c) for c in args.cities.split(",") if c.strip()}

    code_to_name = parse_municipios(_iter_lines(args.municipios))
    target_codes = {code: name for code, name in code_to_name.items() if _norm(name) in wanted_cities}
    if not target_codes:
        print(f"nenhum municipio casou com {wanted_cities} na lista da Receita")
        return 1
    print(f"municipios alvo: {sorted(target_codes.values())} ({len(target_codes)} codigos)")

    # Pass 1: estabelecimentos filtrados por UF + municipio alvo
    records: dict[str, dict] = {}
    for path in _expand(args.estab):
        print(f"lendo estab {path} ...")
        for line in _iter_lines(path):
            rec = parse_estabelecimento(line)
            if not rec or rec["uf"] != uf or rec["municipio_code"] not in target_codes:
                continue
            rec["municipio"] = target_codes[rec["municipio_code"]]
            rec.pop("municipio_code", None)
            records[rec["cnpj"]] = rec
    print(f"estabelecimentos no alvo: {len(records)}")

    # Pass 2: razao social (so pros basicos que entraram)
    basicos = {c[:8] for c in records}
    razao: dict[str, str] = {}
    for path in _expand(args.empresas):
        print(f"lendo empresas {path} ...")
        razao.update(parse_empresas_razao(_iter_lines(path), basicos))
    for cnpj, rec in records.items():
        rec["razao_social"] = razao.get(cnpj[:8])

    _upsert(url, key, list(records.values()))
    print(f"OK: {len(records)} estabelecimentos no Supabase.")
    return 0


def _upsert(url: str, key: str, rows: list[dict]) -> None:
    endpoint = url.rstrip("/") + "/rest/v1/receita_estabelecimento?on_conflict=cnpj"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    with httpx.Client(timeout=60.0, headers=headers) as c:
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            r = c.post(endpoint, json=chunk)
            r.raise_for_status()
            print(f"  upsert {i + len(chunk)}/{len(rows)}")


if __name__ == "__main__":
    raise SystemExit(main())
