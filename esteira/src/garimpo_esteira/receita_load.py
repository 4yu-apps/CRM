"""Loader dos Dados Abertos da Receita -> tabela receita_estabelecimento (Fase 5.5b).

OPERACIONAL (o dono roda local, NAO o cron): os arquivos da Receita somam ~15GB
e nao cabem no runner. O fluxo: baixar os zips ESTABELECIMENTOS + EMPRESAS +
MUNICIPIOS de https://dadosabertos.rfb.gov.br/CNPJ/, e rodar este loader filtrando
pelos municipios que voce prospecta. Saida: um subset pequeno no Supabase que o
autopilot consulta de graca.

Este modulo expoe os transformadores PUROS (testaveis). O streaming/upsert fica no
script scripts/load_receita.py, que chama estas funcoes.

Layout (CSV ;-sep, aspas, latin-1, sem cabecalho):
- ESTABELECIMENTOS: 30 colunas (CNPJ basico/ordem/dv, fantasia, situacao, datas,
  CNAE, endereco, DDD+telefone, email...).
- EMPRESAS: cnpj_basico; razao_social; ...
- MUNICIPIOS: codigo; nome.
"""
from __future__ import annotations

import csv
import io

# codigo da situacao cadastral -> texto (mesmo vocabulario do company_status).
_SITUACAO = {"01": "NULA", "02": "ATIVA", "03": "SUSPENSA", "04": "INAPTA", "08": "BAIXADA"}


def map_situacao(code: str | None) -> str | None:
    return _SITUACAO.get((code or "").strip())


def _iso_date(raw: str | None) -> str | None:
    s = (raw or "").strip()
    if len(s) != 8 or not s.isdigit() or s == "00000000":
        return None
    return f"{s[0:4]}-{s[4:6]}-{s[6:8]}"


def _phone(ddd: str | None, tel: str | None) -> str | None:
    d = "".join(ch for ch in f"{ddd or ''}{tel or ''}" if ch.isdigit())
    return d if len(d) >= 10 else None


def _row(line: str) -> list[str] | None:
    try:
        return next(csv.reader(io.StringIO(line), delimiter=";", quotechar='"'))
    except (csv.Error, StopIteration):
        return None


def parse_estabelecimento(line: str) -> dict | None:
    """Linha do ESTABELECIMENTOS -> registro da tabela (razao_social vem das
    EMPRESAS depois). None quando o CNPJ nao fecha 14 digitos."""
    r = _row(line)
    if not r or len(r) < 28:
        return None
    cnpj = f"{r[0]}{r[1]}{r[2]}"
    if len(cnpj) != 14 or not cnpj.isdigit():
        return None
    logradouro = " ".join(p for p in (r[13], r[14]) if p).strip() or None
    return {
        "cnpj": cnpj,
        "razao_social": None,
        "nome_fantasia": r[4] or None,
        "situacao": map_situacao(r[5]),
        "data_inicio": _iso_date(r[10]),
        "cnae": r[11] or None,
        "logradouro": logradouro,
        "numero": r[15] or None,
        "bairro": r[17] or None,
        "cep": r[18] or None,
        "uf": r[19] or None,
        "municipio_code": r[20] or None,
        "telefone": _phone(r[21], r[22]),
        "email": (r[27] or None) if len(r) > 27 else None,
    }


def parse_municipios(lines) -> dict[str, str]:
    """codigo -> nome (uppercase, como a Receita ja entrega)."""
    out: dict[str, str] = {}
    for line in lines:
        r = _row(line)
        if r and len(r) >= 2 and r[0]:
            out[r[0]] = r[1]
    return out


def parse_empresas_razao(lines, wanted: set[str]) -> dict[str, str]:
    """cnpj_basico -> razao_social, so pros basicos que interessam (subset pequeno
    pra caber na memoria; o set vem dos estabelecimentos ja filtrados)."""
    out: dict[str, str] = {}
    for line in lines:
        r = _row(line)
        if r and len(r) >= 2 and r[0] in wanted:
            out[r[0]] = r[1] or None
    return out
