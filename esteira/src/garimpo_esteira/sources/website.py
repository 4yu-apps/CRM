"""Fonte site — confirma presença/alcance do site (sinal de descuido digital).

Ausência de site é SINAL (lead quente pra quem vende design/SEO), não bug. Aqui
só confirmamos o que existe; a ausência vira (proveniência vazia) e é avaliada
no score (Fase 3).
"""
from __future__ import annotations

from typing import Callable

import httpx

from ..models import Finding, Lead
from ..validation import clean

# reachable(url) -> True se responde (2xx/3xx)
ReachFn = Callable[[str], bool]


def http_reachable(url: str, *, client: httpx.Client | None = None, timeout: float = 8.0) -> bool:
    if not url.startswith(("http://", "https://")):
        url = "https://" + url
    own = client is None
    client = client or httpx.Client(timeout=timeout, follow_redirects=True,
                                    headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.head(url)
        if resp.status_code >= 400:
            resp = client.get(url)
        return resp.status_code < 400
    except httpx.HTTPError:
        return False
    finally:
        if own:
            client.close()


class WebsiteSource:
    name = "website"

    def __init__(self, reachable: ReachFn | None = None):
        self._reachable = reachable or http_reachable

    def enrich(self, lead: Lead) -> list[Finding]:
        site = clean("website", lead.website)
        if not site:
            return []  # sem site: sinal tratado no score, não aqui
        if self._reachable(site):
            return [Finding("website", self.name, site, 0.9)]
        return []
