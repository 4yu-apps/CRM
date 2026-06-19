"""Provedor de rascunho Gemini — free tier (Flash). API de verdade, R$0 no volume.

Free tier (~1.500 req/dia, sem cartao) é muito acima da prospeccao diaria.
Inerte até existir GEMINI_API_KEY. Pega o JSON {msg1, msg2} do modelo.

Pegadinha (mapa §5): prompts do free tier podem ser usados pra treinar o modelo
do Google. Dado publico de negocio = baixo risco. Pra evitar, use o tier pago.
"""
from __future__ import annotations

import json

import httpx

from ..models import Lead
from .prompt import build_prompt

API_URL = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"


class GeminiDraftProvider:
    def __init__(self, api_key: str, model: str = "gemini-flash-latest", timeout: float = 30.0):
        self._key = api_key
        self.model = model
        self._timeout = timeout

    def generate(self, lead: Lead) -> tuple[str, str]:
        body = {
            "contents": [{"parts": [{"text": build_prompt(lead)}]}],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.8,
            },
        }
        with httpx.Client(timeout=self._timeout) as client:
            resp = client.post(
                API_URL.format(model=self.model),
                params={"key": self._key},
                json=body,
            )
            resp.raise_for_status()
            data = resp.json()

        text = data["candidates"][0]["content"]["parts"][0]["text"]
        parsed = json.loads(text)
        return parsed["msg1"], parsed["msg2"]
