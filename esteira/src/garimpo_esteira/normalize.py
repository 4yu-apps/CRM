"""Normalização e chaves de dedup — espelham as colunas geradas do banco."""
from __future__ import annotations

import re

_DIGITS = re.compile(r"\D")


def only_digits(value: str | None) -> str:
    return _DIGITS.sub("", value or "")


def normalize_cnpj(value: str | None) -> str | None:
    """14 dígitos ou None. Não valida dígito verificador — só formato."""
    d = only_digits(value)
    return d if len(d) == 14 else None


def normalize_phone(value: str | None) -> str | None:
    """Telefone BR só dígitos (com DDD). Remove +55 quando vier com 12/13 díg."""
    d = only_digits(value)
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    return d if len(d) in (10, 11) else None


def normalize_instagram(value: str | None) -> str | None:
    if not value:
        return None
    v = value.strip()
    m = re.search(r"instagram\.com/([A-Za-z0-9_.]+)", v)
    if m:
        v = m.group(1)
    v = v.lstrip("@").strip("/")
    return f"@{v}" if v else None


def dedup_key(cnpj: str | None, phone: str | None) -> str | None:
    """Chave de dedup: CNPJ normalizado tem prioridade; senão telefone."""
    c = normalize_cnpj(cnpj)
    if c:
        return f"cnpj:{c}"
    p = normalize_phone(phone)
    if p:
        return f"phone:{p}"
    return None
