"""Fonte CNPJ — waterfall de APIs publicas gratuitas. Nucleo do enriquecimento.

Entrega telefone, e-mail, nome do socio e data de abertura a partir do CNPJ.
E o que cumpre os criterios de aceite: >=80% com telefone e meta de nome do dono.

O3 (waterfall): tenta BrasilAPI primeiro; se ela cair ou bater limite, cai pra
ReceitaWS (cnpj_ws). Tudo gratis. A proveniencia segue por fonte: cada achado
leva o nome de quem o achou (cnpj_brasilapi | cnpj_ws).
"""
from __future__ import annotations

import json
from typing import Callable

import httpx

from ..models import Finding, Lead
from ..normalize import normalize_cnpj
from ..validation import clean

BRASILAPI_URL = "https://brasilapi.com.br/api/cnpj/v1/{cnpj}"
RECEITAWS_URL = "https://receitaws.com.br/v1/cnpj/{cnpj}"

# fetch(cnpj_14_digitos) -> dict bruto da API | None
FetchFn = Callable[[str], dict | None]
# provedor da cascata: (nome_da_fonte, fetch). O nome escolhe o parser e vira a
# proveniencia do achado.
Provider = tuple[str, FetchFn]


def brasilapi_fetch(cnpj: str, *, client: httpx.Client | None = None, timeout: float = 10.0) -> dict | None:
    return _get_json(BRASILAPI_URL.format(cnpj=cnpj), client=client, timeout=timeout)


def receitaws_fetch(cnpj: str, *, client: httpx.Client | None = None, timeout: float = 10.0) -> dict | None:
    return _get_json(RECEITAWS_URL.format(cnpj=cnpj), client=client, timeout=timeout)


def _get_json(url: str, *, client: httpx.Client | None, timeout: float) -> dict | None:
    own = client is None
    client = client or httpx.Client(timeout=timeout, headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.get(url)
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

    def __init__(self, fetch: FetchFn | None = None, *, providers: list[Provider] | None = None):
        if providers is not None:
            self._providers = list(providers)
        elif fetch is not None:
            # fetch injetado = um provedor so (fixture/teste), parseado como BrasilAPI
            self._providers = [("cnpj_brasilapi", fetch)]
        else:
            # waterfall real: BrasilAPI primeiro, ReceitaWS (cnpj_ws) de reserva
            self._providers = [
                ("cnpj_brasilapi", brasilapi_fetch),
                ("cnpj_ws", receitaws_fetch),
            ]

    def enrich(self, lead: Lead) -> list[Finding]:
        cnpj = normalize_cnpj(lead.cnpj)
        if not cnpj:
            return []
        for source, fetch in self._providers:
            try:
                data = fetch(cnpj)
            except Exception:
                data = None  # provedor instavel nao derruba a cascata: tenta o proximo
            if not data:
                continue
            findings = _PARSERS[source](data, source)
            if findings:
                return findings
        return []


def _parse_brasilapi(data: dict, source: str) -> list[Finding]:
    findings: list[Finding] = []

    phone = clean("phone", data.get("ddd_telefone_1") or data.get("ddd_telefone_2"))
    if phone:
        findings.append(Finding("phone", source, phone, 0.8))

    email = clean("email", data.get("email"))
    if email:
        findings.append(Finding("email", source, email, 0.6))

    partner = _first_partner(data)
    owner = clean("owner_name", partner or data.get("razao_social"))
    if owner:
        findings.append(Finding("owner_name", source, owner, 0.85 if partner else 0.5))

    opened = _normalize_open_date(data.get("data_inicio_atividade"))
    if opened:
        findings.append(Finding("opened_on", source, opened, 1.0))

    status = _clean_status(data.get("descricao_situacao_cadastral"))
    if status:
        findings.append(Finding("company_status", source, status, 1.0))

    cnae = clean("category", data.get("cnae_fiscal_descricao"))
    if cnae:
        findings.append(Finding("category", source, cnae, 0.6))

    porte = str(data.get("porte") or data.get("descricao_porte") or "").strip()
    if porte:
        findings.append(Finding("porte", source, porte, 1.0))

    capital = data.get("capital_social")
    if capital not in (None, ""):
        findings.append(Finding("capital_social", source, str(capital), 1.0))

    qsa = data.get("qsa") or data.get("socios") or []
    if isinstance(qsa, list) and qsa:
        findings.append(Finding("socios_count", source, str(len(qsa)), 1.0))

    # Optante Simples / MEI: regime tributario, ja vem na resposta. Vai no
    # site_signals (jsonb, sem migration); o cascade faz merge entre fontes.
    flags: dict[str, bool] = {}
    if data.get("opcao_pelo_simples") is not None:
        flags["simples"] = bool(data.get("opcao_pelo_simples"))
    if data.get("opcao_pelo_mei") is not None:
        flags["mei"] = bool(data.get("opcao_pelo_mei"))
    if flags:
        findings.append(Finding("site_signals", source, json.dumps(flags), 1.0))

    return findings


def _parse_receitaws(data: dict, source: str) -> list[Finding]:
    # ReceitaWS: status OK/ERROR; campos telefone, email, nome (razao social),
    # qsa[].nome, abertura (DD/MM/YYYY). Status ERROR = CNPJ recusado/limite.
    if not isinstance(data, dict) or str(data.get("status", "")).upper() == "ERROR":
        return []
    findings: list[Finding] = []

    phone = clean("phone", data.get("telefone"))
    if phone:
        findings.append(Finding("phone", source, phone, 0.8))

    email = clean("email", data.get("email"))
    if email:
        findings.append(Finding("email", source, email, 0.6))

    partner = _first_partner(data)
    owner = clean("owner_name", partner or data.get("nome"))
    if owner:
        findings.append(Finding("owner_name", source, owner, 0.85 if partner else 0.5))

    opened = _normalize_open_date(data.get("abertura"))
    if opened:
        findings.append(Finding("opened_on", source, opened, 1.0))

    status = _clean_status(data.get("situacao"))
    if status:
        findings.append(Finding("company_status", source, status, 1.0))

    atividade = data.get("atividade_principal") or []
    cnae = clean("category", atividade[0].get("text")) if isinstance(atividade, list) and atividade else None
    if cnae:
        findings.append(Finding("category", source, cnae, 0.6))

    return findings


def _clean_status(raw: str | None) -> str | None:
    """Situacao cadastral em MAIUSCULA (ATIVA/BAIXADA/INAPTA/SUSPENSA/NULA)."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip().upper()
    return s or None


_PARSERS: dict[str, Callable[[dict, str], list[Finding]]] = {
    "cnpj_brasilapi": _parse_brasilapi,
    "cnpj_ws": _parse_receitaws,
}


def _normalize_open_date(raw: str | None) -> str | None:
    """Normaliza a data de abertura pra ISO YYYY-MM-DD. Aceita ISO (BrasilAPI)
    e DD/MM/YYYY (ReceitaWS). Fora disso vira None (campo ausente, nao erro)."""
    if not raw or not isinstance(raw, str):
        return None
    s = raw.strip()[:10]
    try:
        if "/" in s:
            d, m, y = s.split("/")
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        y, m, d = s.split("-")
        return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
    except (ValueError, TypeError):
        return None


def _first_partner(data: dict) -> str | None:
    qsa = data.get("qsa") or []
    if qsa and isinstance(qsa, list):
        return qsa[0].get("nome_socio") or qsa[0].get("nome")
    return None
