"""Fonte de teor das avaliacoes do Google (Place Details New).

Coleta o que os clientes elogiam e reclamam como ponto de conexao humana na
copy. Custa (Place Details e o SKU mais caro do Places), entao roda SO em lead
qualificado e fica DESLIGADA por padrao (reviews_enabled=False em Config).

Fetch e summarizer sao injetaveis: sem chave/flag, a fonte fica inerte.
"""
from __future__ import annotations

import json
from typing import Callable

import httpx

from ..models import Finding

PLACE_DETAILS_URL = "https://places.googleapis.com/v1/places/{place_id}"

# fetch(place_id) -> list[dict]  cada item {"rating": int|None, "text": str}
FetchFn = Callable[[str], list[dict]]

REVIEW_SYSTEM = (
    "Voce analisa avaliacoes de um negocio local. Responda SOMENTE um JSON com "
    "as chaves elogio (o que mais elogiam, frase curta), reclamacao (o que mais "
    "reclamam, ou string vazia se nao houver), resumo (1 frase). "
    "Sem numeros, sem travessao, sem invencao."
)


def place_details_reviews(api_key: str, *, timeout: float = 15.0, client=None) -> FetchFn:
    """Retorna uma funcao fetch(place_id) -> list[dict].

    O client httpx e injetavel (testes offline). Em producao, abre e fecha um
    Client proprio por chamada.
    """

    def fetch(place_id: str) -> list[dict]:
        headers = {
            "X-Goog-Api-Key": api_key,
            "X-Goog-FieldMask": "reviews",
        }
        own = client is None
        c = client or httpx.Client(timeout=timeout)
        try:
            r = c.get(PLACE_DETAILS_URL.format(place_id=place_id), headers=headers)
            if r.status_code != 200:
                return []
            data = r.json()
        except Exception:
            return []
        finally:
            if own:
                c.close()
        out: list[dict] = []
        for rev in data.get("reviews", []):
            txt = (rev.get("text") or {}).get("text") or (rev.get("originalText") or {}).get("text")
            if txt:
                out.append({"rating": rev.get("rating"), "text": txt})
        return out

    return fetch


def make_groq_review_summarizer(
    api_key: str,
    base_url: str,
    model: str,
    *,
    timeout: float = 20.0,
    post: Callable[[dict], dict] | None = None,
) -> Callable[[list[dict]], dict | None]:
    """Espelha make_groq_extractor de extract_llm.py.

    Recebe a lista de reviews e devolve {"elogio": str, "reclamacao": str,
    "resumo": str} ou None em falha. `post` e injetavel pra testes offline.
    """

    def _call(body: dict) -> dict:
        if post is not None:
            return post(body)
        with httpx.Client(timeout=timeout) as c:
            r = c.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            r.raise_for_status()
            return r.json()

    def summarize(reviews: list[dict]) -> dict | None:
        if not reviews:
            return None
        snippets = [
            f"nota {r.get('rating') or '?'}: {(r.get('text') or '')[:300]}"
            for r in reviews[:10]
        ]
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": REVIEW_SYSTEM},
                {"role": "user", "content": "\n".join(snippets)},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        try:
            data = _call(body)
            return json.loads(data["choices"][0]["message"]["content"])
        except Exception:
            return None

    return summarize


class ReviewsSource:
    """Fonte de teor de avaliacoes. Inerte sem fetch ou sem place_id no lead."""

    # name de classe para identificacao; Finding.source usa "google_maps"
    # (unico LeadSource valido do Maps).
    name = "google_reviews"

    def __init__(
        self,
        fetch: FetchFn | None = None,
        summarize: Callable[[list[dict]], dict | None] | None = None,
    ):
        self._fetch = fetch
        self._summarize = summarize

    def enrich(self, lead) -> list[Finding]:
        if self._fetch is None or not getattr(lead, "maps_place_id", None):
            return []
        reviews = self._fetch(lead.maps_place_id)
        if not reviews:
            return []
        findings: list[Finding] = []
        # amostra crua (ate 3, texto truncado) pro humano ver no CRM
        sample = [
            {"rating": r.get("rating"), "text": (r.get("text") or "")[:240]}
            for r in reviews[:3]
        ]
        findings.append(
            Finding("review_sample", "google_maps", json.dumps(sample, ensure_ascii=False), 0.9)
        )
        # teor resumido (so com summarizer): ancora real da copy
        if self._summarize:
            try:
                themes = self._summarize(reviews)
            except Exception:
                themes = None
            if themes and themes.get("elogio"):
                findings.append(
                    Finding(
                        "review_themes",
                        "google_maps",
                        json.dumps(themes, ensure_ascii=False),
                        0.8,
                    )
                )
        return findings
