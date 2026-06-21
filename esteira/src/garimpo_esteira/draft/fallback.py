"""Rede de seguranca: tenta a IA real e, se falhar, cai no backup (mock).

Assim ligar Gemini/Groq nunca derruba o robo: rate limit, chave sem credito,
timeout ou JSON quebrado viram fallback pro template, e a esteira segue.
"""
from __future__ import annotations

from ..models import Lead
from .base import DraftProvider


class FallbackDraftProvider:
    def __init__(self, primary: DraftProvider, backup: DraftProvider):
        self._primary = primary
        self._backup = backup
        self.model = getattr(primary, "model", "ia")

    def generate(self, lead: Lead) -> tuple[str, str]:
        try:
            msg1, msg2 = self._primary.generate(lead)
            if msg1 and msg2:
                return msg1, msg2
        except Exception:
            pass  # qualquer falha da IA cai no backup, nao derruba a esteira
        return self._backup.generate(lead)
