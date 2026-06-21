"""Fonte Meta Ad Library — 'o lead já anuncia?' (sinal de qualificação).

Anota proveniência 'ads_active' (sim/nao). Não é coluna do lead — é sinal pro
score (Fase 3); a tabela de proveniência aceita qualquer field_name. Requer
token da Ad Library API; sem token, fica inerte (devolve []).
"""
from __future__ import annotations

from typing import Callable

from ..models import Finding, Lead

# probe(lead) -> True (anuncia) / False (não) / None (desconhecido)
ProbeFn = Callable[[Lead], bool | None]

AD_ARCHIVE_URL = "https://graph.facebook.com/v21.0/ads_archive"


def meta_ads_probe(token: str, *, country: str = "BR", timeout: float = 10.0) -> ProbeFn:
    """Probe real da Ad Library API: True se o negocio tem anuncio ATIVO no pais.

    Sem token, nem se chama (build_sources deixa a fonte inerte). Qualquer falha
    de rede ou resposta inesperada vira None (desconhecido), nunca derruba.
    """
    import httpx

    def probe(lead: Lead) -> bool | None:
        name = (lead.business_name or "").strip()
        if not name:
            return None
        try:
            r = httpx.get(
                AD_ARCHIVE_URL,
                params={
                    "search_terms": name,
                    "ad_reached_countries": f'["{country}"]',
                    "ad_active_status": "ACTIVE",
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
