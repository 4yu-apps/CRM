"""Validação de conteúdo — 'valide o conteúdo, não o status HTTP'.

Maps/fontes às vezes devolvem dado incompleto que parece válido (falha
silenciosa, resposta 200 com campo vazio). Aqui checamos se o campo VEIO
mesmo. Ausência vira campo vazio (sinal), nunca erro.
"""
from __future__ import annotations

from .normalize import (
    normalize_cnpj,
    normalize_facebook,
    normalize_instagram,
    normalize_phone,
)

_PLACEHDR = {"", "-", "—", "n/a", "na", "null", "none", "(ausente)", "sem informacao"}


def _blank(value: str | None) -> bool:
    return value is None or value.strip().lower() in _PLACEHDR


def is_present(field_name: str, value: str | None) -> bool:
    """True se o campo realmente tem conteúdo útil (não placeholder)."""
    if _blank(value):
        return False
    if field_name in ("phone", "whatsapp"):
        return normalize_phone(value) is not None
    if field_name == "cnpj":
        return normalize_cnpj(value) is not None
    if field_name == "instagram":
        return normalize_instagram(value) is not None
    if field_name == "facebook":
        return normalize_facebook(value) is not None
    if field_name == "email":
        return "@" in value and "." in value.split("@")[-1]
    if field_name == "website":
        return "." in value
    return True


def clean(field_name: str, value: str | None) -> str | None:
    """Normaliza/limpa o valor; devolve None se não for conteúdo válido."""
    if not is_present(field_name, value):
        return None
    if field_name in ("phone", "whatsapp"):
        return normalize_phone(value)
    if field_name == "cnpj":
        return normalize_cnpj(value)
    if field_name == "instagram":
        return normalize_instagram(value)
    if field_name == "facebook":
        return normalize_facebook(value)
    assert value is not None
    return value.strip()
