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
    """Telefone BR valido, so digitos (com DDD). Remove +55 quando vier com 12/13 dig.

    Valida DDD (Anatel) e formato movel/fixo via geo.is_br_phone.
    Retorna None para telefones invalidos ou estrangeiros (ex.: EUA 4086482555).
    """
    from .geo import is_br_phone

    if not is_br_phone(value):
        return None
    d = _DIGITS.sub("", value or "")
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    return d


def normalize_whatsapp(value: str | None) -> str | None:
    """WhatsApp BR valido, so digitos (com DDD). Aceita link wa.me/55..., texto livre ou
    numero; reusa a regra do telefone (tira +55 quando vier 12/13 dig)."""
    return normalize_phone(value)


def normalize_facebook(value: str | None) -> str | None:
    """Handle/slug da pagina do Facebook. Extrai de facebook.com/<slug> ou fb.com/
    <slug>; remove query/barra. Devolve o slug puro (sem dominio) ou None."""
    if not value:
        return None
    v = value.strip()
    m = re.search(r"(?:facebook\.com|fb\.com|fb\.me)/([^/?#\s]+)", v, re.IGNORECASE)
    if m:
        v = m.group(1)
    v = v.strip("/@").split("?")[0].strip()
    return v or None


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
