"""Validacao geografica Brasil-only (trava Brasil).

Todas as funcoes sao puras e sem efeitos colaterais: recebem strings,
devolvem bool. A regra geral eh conservadora: so marca como estrangeiro
quando ha evidencia positiva. Dado ausente/vazio nao e estrangeiro.
"""
from __future__ import annotations

import re as _re

# DDDs validos do Brasil (oficiais da Anatel)
VALID_DDD: frozenset[int] = frozenset({
    11, 12, 13, 14, 15, 16, 17, 18, 19,
    21, 22, 24,
    27, 28,
    31, 32, 33, 34, 35, 37, 38,
    41, 42, 43, 44, 45, 46,
    47, 48, 49,
    51, 53, 54, 55,
    61,
    62, 64,
    63,
    65, 66,
    67,
    68,
    69,
    71, 73, 74, 75, 77,
    79,
    81, 87,
    82,
    83,
    84,
    85, 88,
    86, 89,
    91, 93, 94,
    92, 97,
    95,
    96,
    98, 99,
})

# UFs validas do Brasil
VALID_UF: frozenset[str] = frozenset({
    "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO",
    "MA", "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI",
    "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
})

# Paises estrangeiros que aparecem NO FIM do endereco formatado do Maps. So o
# pais (nao cidade/estado): rua/avenida BR se chama "Av. Republica Argentina",
# "Rua Estados Unidos", "Rua California" etc., entao bairro/rua NUNCA viram
# criterio. O endereco BR do Maps sempre termina em "Brasil"/"Brazil".
FOREIGN_END_MARKERS: tuple[str, ...] = (
    "eua", "usa", "estados unidos", "united states", "ee.uu",
    "portugal", "espanha", "espana", "españa", "argentina", "uruguai",
    "paraguai", "chile", "mexico", "méxico", "colombia", "venezuela",
    "peru", "perú", "bolivia", "equador", "canada", "canadá",
    "australia", "england", "united kingdom", "reino unido",
    "france", "frança", "germany", "alemanha", "italia", "itália", "italy",
    "japan", "japão", "china",
)

_DIGITS = _re.compile(r"\D")


def is_br_uf(state: str | None) -> bool:
    """True se a UF pertence ao Brasil. None ou vazio retorna False."""
    if not state:
        return False
    return state.upper().strip() in VALID_UF


def is_br_phone(value: str | None) -> bool:
    """True se o numero e um telefone brasileiro valido (com DDD).

    Regras:
    - Extrai so digitos.
    - Remove prefixo 55 se vier com 12 ou 13 digitos (DDI Brasil).
    - Apos a remocao, precisa ter 10 (fixo) ou 11 (movel) digitos.
    - Os 2 primeiros digitos formam o DDD, que deve estar em VALID_DDD.
    - Movel (11 dig): o 3o digito deve ser '9'.
    - Fixo (10 dig): o 3o digito deve ser um de '2','3','4','5'.
    - Qualquer violacao retorna False.

    Exemplos:
    - "4086482555" (EUA) -> False: DDD 40 nao existe.
    - "(11) 99999-0001" -> True: movel SP valido.
    - "(44) 3025-1234" -> True: fixo Maringa valido.
    - "+55 11 99999-0001" -> True: DDI removido, movel SP valido.
    """
    if not value:
        return False
    d = _DIGITS.sub("", value)
    # Remove DDI Brasil quando presente
    if d.startswith("55") and len(d) in (12, 13):
        d = d[2:]
    if len(d) not in (10, 11):
        return False
    ddd = int(d[:2])
    if ddd not in VALID_DDD:
        return False
    third = d[2]
    if len(d) == 11:
        # Celular: terceiro digito deve ser 9
        return third == "9"
    # Fixo: terceiro digito deve ser 2-5
    return third in "2345"


def looks_foreign(state: str | None, address: str | None) -> bool:
    """True quando ha evidencia positiva de que o lead nao e brasileiro.

    A UF manda: se vier uma UF brasileira valida, o lead E brasileiro, mesmo que
    a rua se chame "Av. Republica Argentina" ou "Rua Estados Unidos" (varias ruas
    BR tem nome de pais; nome de rua/bairro NUNCA e criterio). So quando NAO ha
    UF e que olhamos o PAIS no fim do endereco (o Maps BR termina em "Brasil").

    Criterios:
    1. state preenchido: estrangeiro <=> nao e UF brasileira valida.
    2. sem state: estrangeiro se o endereco termina num pais estrangeiro, ou tem
       padrao de CEP americano (duas letras + espaco + 5 digitos). Endereco que
       termina em "Brasil"/"Brazil", ou vazio, nao e estrangeiro.

    Regra conservadora: dados ausentes/vazios nao tornam o lead estrangeiro.
    """
    if state and state.strip():
        return not is_br_uf(state)

    addr = (address or "").strip()
    if not addr:
        return False
    low = addr.lower()
    if low.endswith("brasil") or low.endswith("brazil"):
        return False
    for marker in FOREIGN_END_MARKERS:
        if low.endswith(marker):
            return True
    # CEP americano no fim (ex.: "San Jose, CA 95112"): UF de 2 letras + espaco
    # + 5 digitos. A virgula do padrao BR ("- SP, 01021-200") nao casa aqui.
    if _re.search(r"\b[A-Za-z]{2}\s+\d{5}(?:-\d{4})?\b", addr):
        return True
    return False
