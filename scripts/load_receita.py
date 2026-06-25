#!/usr/bin/env python3
"""Carrega o subset da Receita (Dados Abertos) na tabela receita_estabelecimento.

ONLINE: roda no GitHub Actions (workflow load-receita.yml), sem PC do dono. Baixa
cada zip da Receita, processa em streaming e apaga (pico de disco ~1 zip), filtra
pelos municipios que voce prospecta e faz upsert no Supabase.

Cidades: por padrao puxa do search_profile (--from-profiles); ou passe --cities.
Arquivos: --base-url (pasta do mes na Receita) baixa Municipios/Estabelecimentos/
Empresas; ou passe caminhos/URLs locais via --municipios/--estab/--empresas.

Le SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY do ambiente (.env / secrets).
"""
from __future__ import annotations

import argparse
import glob
import os
import sys
import tempfile
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
_ESTAB_NAMES = [f"Estabelecimentos{i}.zip" for i in range(10)]
_EMPRESA_NAMES = [f"Empresas{i}.zip" for i in range(10)]


def _norm(s: str) -> str:
    s = unicodedata.normalize("NFKD", s or "")
    s = "".join(c for c in s if not unicodedata.combining(c))
    return " ".join(s.upper().split())


# ---- aquisicao (URL ou caminho local), processando um arquivo por vez ----------
def _download(url: str, dest: Path) -> Path:
    print(f"  baixando {url} ...")
    with httpx.stream("GET", url, timeout=None, follow_redirects=True) as r:
        r.raise_for_status()
        with open(dest, "wb") as fh:
            for chunk in r.iter_bytes(1 << 20):
                fh.write(chunk)
    return dest


def _lines_of(src: str, tmpdir: Path):
    """Linhas (latin-1) de um src (URL .zip ou caminho .zip/.csv). Baixa pra tmp,
    le e apaga o que baixou (mantem o disco baixo)."""
    downloaded = None
    try:
        if src.startswith("http://") or src.startswith("https://"):
            downloaded = _download(src, tmpdir / Path(src).name)
            path = str(downloaded)
        else:
            path = src
        if path.lower().endswith(".zip"):
            with zipfile.ZipFile(path) as z:
                for name in z.namelist():
                    with z.open(name) as fh:
                        for raw in fh:
                            yield raw.decode("latin-1").rstrip("\n")
        else:
            with open(path, encoding="latin-1") as fh:
                for raw in fh:
                    yield raw.rstrip("\n")
    finally:
        if downloaded and downloaded.exists():
            downloaded.unlink()


def _sources(explicit: list[str] | None, base_url: str | None, names: list[str]) -> list[str]:
    if explicit:
        out: list[str] = []
        for p in explicit:
            out.extend(sorted(glob.glob(p)) if not p.startswith("http") else [p])
        return out
    if base_url:
        b = base_url.rstrip("/") + "/"
        return [b + n for n in names]
    return []


# ---- alvos (UF, cidade-normalizada) --------------------------------------------
def _from_profiles(url: str, key: str) -> set[tuple[str, str]]:
    r = httpx.get(
        url.rstrip("/") + "/rest/v1/search_profile?select=state,city",
        headers={"apikey": key, "Authorization": f"Bearer {key}"}, timeout=30.0,
    )
    r.raise_for_status()
    targets = set()
    for row in r.json() or []:
        uf, city = row.get("state"), row.get("city")
        if uf and city:
            targets.add((uf.upper(), _norm(city)))
    return targets


def _resolve_targets(args, url, key) -> set[tuple[str, str]]:
    if args.cities:
        # formato "UF:Cidade;UF:Cidade" ou, com --uf, "Cidade;Cidade"
        out = set()
        for item in args.cities.split(";"):
            item = item.strip()
            if not item:
                continue
            if ":" in item:
                uf, city = item.split(":", 1)
            else:
                uf, city = args.uf or "", item
            out.add((uf.upper(), _norm(city)))
        return out
    return _from_profiles(url, key)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", help="pasta do mes na Receita (baixa os zips)")
    ap.add_argument("--municipios")
    ap.add_argument("--estab", nargs="+")
    ap.add_argument("--empresas", nargs="+")
    ap.add_argument("--from-profiles", action="store_true", help="cidades do search_profile")
    ap.add_argument("--uf", help="UF padrao quando --cities nao traz UF")
    ap.add_argument("--cities", help='"UF:Cidade;UF:Cidade" (senao usa --from-profiles)')
    ap.add_argument("--tmpdir", default=os.getenv("RUNNER_TEMP") or tempfile.gettempdir())
    args = ap.parse_args()

    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        print("defina SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY")
        return 1

    tmpdir = Path(args.tmpdir)
    tmpdir.mkdir(parents=True, exist_ok=True)

    targets = _resolve_targets(args, url, key)
    if not targets:
        print("nenhuma cidade alvo (passe --cities ou tenha search_profile)")
        return 1
    print(f"alvos: {sorted(targets)}")

    muni_src = ([args.municipios] if args.municipios else
                _sources(None, args.base_url, ["Municipios.zip"]))
    if not muni_src:
        print("faltou Municipios (--municipios ou --base-url)")
        return 1
    code_to_name: dict[str, str] = {}
    for s in muni_src:
        code_to_name.update(parse_municipios(_lines_of(s, tmpdir)))
    # codigos cujos (uf, nome) estao nos alvos sao resolvidos por linha (uf vem do
    # estabelecimento); aqui so guardamos code->name pra montar o registro.

    estab_src = _sources(args.estab, args.base_url, _ESTAB_NAMES)
    records: dict[str, dict] = {}
    for s in estab_src:
        print(f"estab: {s}")
        for line in _lines_of(s, tmpdir):
            rec = parse_estabelecimento(line)
            if not rec:
                continue
            name = code_to_name.get(rec["municipio_code"] or "")
            if not name or (rec["uf"] or "", _norm(name)) not in targets:
                continue
            rec["municipio"] = name
            rec.pop("municipio_code", None)
            records[rec["cnpj"]] = rec
    print(f"estabelecimentos no alvo: {len(records)}")
    if not records:
        return 0

    basicos = {c[:8] for c in records}
    razao: dict[str, str] = {}
    for s in _sources(args.empresas, args.base_url, _EMPRESA_NAMES):
        print(f"empresas: {s}")
        razao.update(parse_empresas_razao(_lines_of(s, tmpdir), basicos))
    for cnpj, rec in records.items():
        rec["razao_social"] = razao.get(cnpj[:8])

    _upsert(url, key, list(records.values()))
    print(f"OK: {len(records)} no Supabase.")
    return 0


def _upsert(url: str, key: str, rows: list[dict]) -> None:
    endpoint = url.rstrip("/") + "/rest/v1/receita_estabelecimento?on_conflict=cnpj"
    headers = {
        "apikey": key, "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=minimal",
    }
    with httpx.Client(timeout=120.0, headers=headers) as c:
        for i in range(0, len(rows), BATCH):
            chunk = rows[i:i + BATCH]
            c.post(endpoint, json=chunk).raise_for_status()
            print(f"  upsert {i + len(chunk)}/{len(rows)}")


if __name__ == "__main__":
    raise SystemExit(main())
