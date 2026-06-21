"""Fonte Meta Ad Library — 'o lead já anuncia?' (sinal de qualificação).

Anota proveniência 'ads_active' (sim/nao). Não é coluna do lead — é sinal pro
score (Fase 3); a tabela de proveniência aceita qualquer field_name. Requer
token da Ad Library API; sem token, fica inerte (devolve []).

CONFIABILIDADE: buscar por nome (search_terms) e furado — casa o TEXTO do
criativo, nao o anunciante (testado: retorna ruido). O caminho confiavel e por
`search_page_ids` (a pagina do Facebook do negocio). Por isso a fonte website
raspa o facebook do site; aqui resolvemos esse slug pro page_id e perguntamos
"essa pagina tem anuncio ativo?". Sem facebook resolvivel, devolvemos None
(desconhecido) em vez de chutar — nada de falso-positivo.
"""
from __future__ import annotations

from typing import Callable

from ..models import Finding, Lead

# probe(lead) -> True (anuncia) / False (não) / None (desconhecido)
ProbeFn = Callable[[Lead], bool | None]

GRAPH_URL = "https://graph.facebook.com/v21.0"
AD_ARCHIVE_URL = f"{GRAPH_URL}/ads_archive"


def resolve_page_id(facebook: str | None, token: str, get, timeout: float) -> str | None:
    """facebook pode ser id numerico (usa direto) ou slug/vanity (resolve pelo
    Graph: GET /{slug}?fields=id). Qualquer falha -> None."""
    fb = (facebook or "").strip().strip("/")
    if not fb:
        return None
    if fb.isdigit():
        return fb
    try:
        r = get(f"{GRAPH_URL}/{fb}", params={"fields": "id", "access_token": token}, timeout=timeout)
        if r.status_code != 200:
            return None
        return r.json().get("id")
    except Exception:
        return None


def has_active_ads(page_id: str, token: str, get, country: str, timeout: float) -> bool | None:
    """True se a pagina tem >=1 anuncio ATIVO no pais. None se a API nao responde."""
    try:
        r = get(
            AD_ARCHIVE_URL,
            params={
                "search_page_ids": f'["{page_id}"]',
                "ad_reached_countries": f'["{country}"]',
                "ad_active_status": "ACTIVE",
                "ad_type": "ALL",
                "fields": "id",
                "limit": "1",
                "access_token": token,
            },
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        return len(r.json().get("data", [])) > 0
    except Exception:
        return None


def meta_ads_probe(token: str, *, country: str = "BR", timeout: float = 10.0, get=None) -> ProbeFn:
    """Probe real da Ad Library API por page_id (confiavel). `get` injetavel pra
    teste; em producao usa httpx. Sem token, build_sources deixa a fonte inerte.
    """
    import httpx

    _get = get or httpx.get

    def probe(lead: Lead) -> bool | None:
        page_id = resolve_page_id(lead.facebook, token, _get, timeout)
        if not page_id:
            return None  # sem pagina resolvivel: desconhecido (nada de chute)
        return has_active_ads(page_id, token, _get, country, timeout)

    return probe


class AdLibrarySource:
    name = "meta_ad_library"

    def __init__(self, probe: ProbeFn | None = None):
        self._probe = probe

    def enrich(self, lead: Lead) -> list[Finding]:
        if self._probe is None:
            return []  # sem token configurado
        result = self._probe(lead)
        if result is None:
            return []
        return [Finding("ads_active", self.name, "sim" if result else "nao", 0.8)]
