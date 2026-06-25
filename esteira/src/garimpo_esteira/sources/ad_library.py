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

# probe(lead) -> dict {active,count,since} (rico) | bool (legado) | None (desconhecido)
ProbeFn = Callable[[Lead], "dict | bool | None"]

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


def has_ads_info(page_id: str, token: str, get, country: str, timeout: float) -> dict | None:
    """Intensidade do anuncio (Fase 6): {active, count, since}. count e quantos
    anuncios ativos (ate o limite); since e o inicio do mais antigo. None se a API
    nao responde. Mesma chamada do has_active_ads, so pedindo mais campos."""
    try:
        r = get(
            AD_ARCHIVE_URL,
            params={
                "search_page_ids": f'["{page_id}"]',
                "ad_reached_countries": f'["{country}"]',
                "ad_active_status": "ACTIVE",
                "ad_type": "ALL",
                "fields": "id,ad_delivery_start_time",
                "limit": "25",
                "access_token": token,
            },
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        data = r.json().get("data", [])
        if not data:
            return {"active": False, "count": 0, "since": None}
        starts = [d.get("ad_delivery_start_time") for d in data if d.get("ad_delivery_start_time")]
        return {"active": True, "count": len(data), "since": min(starts) if starts else None}
    except Exception:
        return None


def meta_ads_probe(token: str, *, country: str = "BR", timeout: float = 10.0, get=None) -> ProbeFn:
    """Probe real da Ad Library API por page_id (confiavel). Devolve dict de
    intensidade {active,count,since} ou None. `get` injetavel pra teste.
    """
    import httpx

    _get = get or httpx.get

    def probe(lead: Lead) -> dict | None:
        page_id = resolve_page_id(lead.facebook, token, _get, timeout)
        if not page_id:
            return None  # sem pagina resolvivel: desconhecido (nada de chute)
        return has_ads_info(page_id, token, _get, country, timeout)

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
        # aceita o probe rico (dict de intensidade) e o legado (bool).
        if isinstance(result, bool):
            active, count, since = result, None, None
        else:
            active, count, since = result.get("active"), result.get("count"), result.get("since")
            if active is None:
                return []
        findings = [Finding("ads_active", self.name, "sim" if active else "nao", 0.8)]
        if active and count:
            findings.append(Finding("ads_count", self.name, str(count), 0.7))
        if active and since:
            findings.append(Finding("ads_since", self.name, since, 0.7))
        return findings
