"""Fonte CNPJ — BrasilAPI (pública, gratuita). Núcleo do enriquecimento.

Entrega telefone, e-mail e nome do sócio a partir do CNPJ. É o que cumpre os
critérios de aceite: >=80% com telefone e meta de nome do dono.
"""
from __future__ import annotations

from typing import Callable

import httpx

from ..models import Finding, Lead
from ..normalize import normalize_cnpj
from ..validation import clean

BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"

# fetch(cnpj_14_digitos) -> dict bruto da API | None
FetchFn = Callable[[str], dict | None]


def brasilapi_fetch(cnpj: str, *, client: httpx.Client | None = None, timeout: float = 10.0) -> dict | None:
    own = client is None
    client = client or httpx.Client(timeout=timeout, headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.get(BRASILAPI_URL.format(cnpj=cnpj))
        if resp.status_code != 200:
            return None
        return resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if own:
            client.close()


class CnpjSource:
    name = "cnpj_brasilapi"

    def __init__(self, fetch: FetchFn | None = None):
        self._fetch = fetch or brasilapi_fetch

    def enrich(self, lead: Lead) -> list[Finding]:
        cnpj = normalize_cnpj(lead.cnpj)
        if not cnpj:
            return []
        data = self._fetch(cnpj)
        if not data:
            return []

        findings: list[Finding] = []

        phone_raw = data.get("ddd_telefone_1") or data.get("ddd_telefone_2")
        phone = clean("phone", phone_raw)
        if phone:
            findings.append(Finding("phone", self.name, phone, 0.8))

        email = clean("email", data.get("email"))
        if email:
            findings.append(Finding("email", self.name, email, 0.6))

        owner = _first_partner(data) or data.get("razao_social")
        owner = clean("owner_name", owner)
        if owner:
            conf = 0.85 if _first_partner(data) else 0.5
            findings.append(Finding("owner_name", self.name, owner, conf))

        return findings


def _first_partner(data: dict) -> str | None:
    qsa = data.get("qsa") or []
    if qsa and isinstance(qsa, list):
        return qsa[0].get("nome_socio") or qsa[0].get("nome")
    return None
