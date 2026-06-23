"""PageSpeed Insights (Google) — performance do site, de graca.

API publica do Google (Lighthouse). Da a nota 0-100 de performance, o LCP e a
categoria de carregamento real (Chrome UX). Para o gestor/UX e o sinal mais
honesto de "esse site presta no celular?". Funciona sem chave (cota baixa) e
melhor com uma chave GRATUITA (PAGESPEED_API_KEY, sem cobranca).

Conservador no estilo do resto da esteira: falha/timeout/sem dado => None (sem
sinal), nunca erro. O resultado e mesclado no site_signals da WebsiteSource.
"""
from __future__ import annotations

from typing import Callable

import httpx

# probe(url) -> dict de performance ou None
PageSpeedFn = Callable[[str], dict | None]

_ENDPOINT = "https://www.googleapis.com/pagespeedonline/v5/runPagespeed"


def _norm_url(url: str) -> str:
    return url if url.startswith(("http://", "https://")) else "https://" + url


def fetch_pagespeed(
    url: str,
    *,
    api_key: str | None = None,
    strategy: str = "mobile",
    client: httpx.Client | None = None,
    timeout: float = 30.0,
) -> dict | None:
    """Consulta o PageSpeed e devolve so o que importa pro score/ficha.

    Retorna {perf_score:0-100, perf_slow:bool, lcp_ms:int, speed_category:str}
    (campos presentes conforme a API entrega). None se falhar.
    """
    if not url:
        return None
    params = {"url": _norm_url(url), "strategy": strategy, "category": "performance"}
    if api_key:
        params["key"] = api_key
    own = client is None
    client = client or httpx.Client(timeout=timeout)
    try:
        resp = client.get(_ENDPOINT, params=params)
        if resp.status_code >= 400:
            return None
        data = resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if own:
            client.close()

    lh = data.get("lighthouseResult") or {}
    perf = (lh.get("categories") or {}).get("performance") or {}
    audits = lh.get("audits") or {}
    out: dict = {}

    score = perf.get("score")
    if isinstance(score, (int, float)):
        out["perf_score"] = round(score * 100)
        out["perf_slow"] = out["perf_score"] < 50

    lcp = (audits.get("largest-contentful-paint") or {}).get("numericValue")
    if isinstance(lcp, (int, float)):
        out["lcp_ms"] = round(lcp)

    cat = (data.get("loadingExperience") or {}).get("overall_category")
    if cat:
        out["speed_category"] = cat  # FAST | AVERAGE | SLOW (dado real do Chrome UX)

    return out or None


def pagespeed_probe(
    api_key: str | None = None, *, strategy: str = "mobile", fetch: PageSpeedFn | None = None
) -> PageSpeedFn:
    """Fabrica o probe injetavel na WebsiteSource. `fetch` permite testar offline."""
    if fetch is not None:
        return fetch

    def probe(url: str) -> dict | None:
        return fetch_pagespeed(url, api_key=api_key, strategy=strategy)

    return probe
