"""Provedor de rascunho OpenAI-compativel, serve Groq, OpenRouter, Together etc.

Groq e GRATIS de verdade (sem cartao), rapido, com modelos Llama bons. A API e
no padrao OpenAI (chat/completions + JSON mode), entao um provider so cobre
varios servicos, e so trocar base_url + model + key. Pega o JSON {msg1, msg2}.
"""
from __future__ import annotations

import json

import httpx

from ..models import Lead
from .prompt import build_prompt


class OpenAICompatDraftProvider:
    def __init__(self, api_key: str, base_url: str, model: str, timeout: float = 30.0):
        self._key = api_key
        self._base = base_url.rstrip("/")
        self.model = model
        self._timeout = timeout

    def generate(self, lead: Lead) -> tuple[str, str]:
        body = {
            "model": self.model,
            "messages": [{"role": "user", "content": build_prompt(lead)}],
            "response_format": {"type": "json_object"},
            "temperature": 0.8,
        }
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                f"{self._base}/chat/completions",
                headers={"Authorization": f"Bearer {self._key}"},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["choices"][0]["message"]["content"]
        parsed = json.loads(text)
        return parsed["msg1"], parsed["msg2"]
