#!/usr/bin/env python3
"""Empacota a extensao buildada num zip que o CRM oferece pra download.

Roda DEPOIS do `npm run build` (o script `npm run zip` encadeia os dois).
Escreve direto em front/public/4yu-crm-extension.zip pra o download nunca
ficar defasado vs o codigo. Usa so a stdlib (zipfile) — sem depender do
binario `zip` do sistema nem de pacote npm.
"""
import sys
import zipfile
from pathlib import Path

EXT = Path(__file__).resolve().parent.parent          # extension/
OUT = EXT.parent / "front" / "public" / "4yu-crm-extension.zip"

# So o que a extensao precisa em runtime (os .mjs sao bundlados nos .bundle.js).
FILES = ["manifest.json", "src/content/panel.css"]
GLOBS = ["*.bundle.js"]
DIRS = ["icons", "src/options"]


def collect():
    paths = []
    for rel in FILES:
        p = EXT / rel
        if p.is_file():
            paths.append(p)
    for pat in GLOBS:
        paths.extend(sorted(EXT.glob(pat)))
    for d in DIRS:
        base = EXT / d
        if base.is_dir():
            paths.extend(sorted(f for f in base.rglob("*") if f.is_file()))
    return paths


def main():
    paths = collect()
    bundles = [p for p in paths if p.suffix == ".js"]
    if not bundles:
        print("ERRO: nenhum *.bundle.js encontrado. Rode `npm run build` antes.", file=sys.stderr)
        return 1
    if not (EXT / "manifest.json").is_file():
        print("ERRO: manifest.json nao encontrado em extension/.", file=sys.stderr)
        return 1

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(OUT, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in paths:
            zf.write(p, p.relative_to(EXT).as_posix())

    print(f"OK: {OUT} ({OUT.stat().st_size} bytes, {len(paths)} arquivos)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
