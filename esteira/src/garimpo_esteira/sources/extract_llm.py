"""Extracao de contatos do site via LLM (Groq, gratis) — reforco do regex.

O regex pega os links obvios (wa.me, instagram.com...). Muito site esconde o
contato em JSON, script, data-attr ou texto solto. Um LLM le o conteudo e acha o
que o regex perde. Roda no SERVIDOR (cron), de graca via Groq — nunca depende de
ninguem ligado. Degrada com graca: qualquer falha -> {} e segue so com o regex
(mesmo padrao do fallback do rascunho).
"""
from __future__ import annotations

import json
import re
from typing import Callable

import httpx

from ..validation import clean

# tira script/style (lixo pesado) e depois as tags, mantendo o texto e os hrefs.
_SCRIPT = re.compile(r"<(script|style)[\s\S]*?</\1>", re.IGNORECASE)
_TAGS = re.compile(r"<[^>]+>")
_WS = re.compile(r"\s+")

_FIELDS = ("instagram", "facebook", "whatsapp", "phone", "email")

SYSTEM = (
    "Voce extrai contatos PUBLICOS de um site de negocio. Responda SOMENTE um "
    "JSON com as chaves instagram, facebook, whatsapp, phone, email. Valores: o "
    "handle/numero/url quando aparecer no conteudo, ou null. NUNCA invente; se "
    "nao houver no texto, use null."
)

# extract(html, business_name) -> {campo: valor_limpo} so com o que achou
Extractor = Callable[[str, str], dict]


def condense(html: str, limit: int = 8000) -> str:
    """Reduz o HTML a texto+links, com teto, pra caber no prompt sem custo alto."""
    txt = _SCRIPT.sub(" ", html or "")
    txt = _TAGS.sub(" ", txt)
    return _WS.sub(" ", txt).strip()[:limit]


def make_groq_extractor(
    api_key: str,
    base_url: str,
    model: str,
    *,
    timeout: float = 20.0,
    post: Callable[[dict], dict] | None = None,
) -> Extractor:
    """`post` injetavel (recebe o body, devolve o JSON da API) pra testar offline."""

    def _call(body: dict) -> dict:
        if post is not None:
            return post(body)
        with httpx.Client(timeout=timeout) as client:
            r = client.post(
                f"{base_url.rstrip('/')}/chat/completions",
                headers={"Authorization": f"Bearer {api_key}"},
                json=body,
            )
            r.raise_for_status()
            return r.json()

    def extract(html: str, business_name: str) -> dict:
        content = condense(html)
        if not content:
            return {}
        body = {
            "model": model,
            "messages": [
                {"role": "system", "content": SYSTEM},
                {"role": "user", "content": f"Negocio: {business_name}\n\n{content}"},
            ],
            "response_format": {"type": "json_object"},
            "temperature": 0,
        }
        try:
            data = _call(body)
            raw = json.loads(data["choices"][0]["message"]["content"])
        except Exception:
            return {}  # rede/rate-limit/JSON quebrado: segue so com o regex

        out: dict = {}
        for f in _FIELDS:
            v = raw.get(f)
            if isinstance(v, str):
                cv = clean(f, v)
                if cv:
                    out[f] = cv
        return out

    return extract
