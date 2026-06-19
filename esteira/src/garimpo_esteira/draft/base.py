"""Contrato de um provedor de rascunho (a copy das 2 mensagens)."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..models import Lead


@runtime_checkable
class DraftProvider(Protocol):
    model: str

    def generate(self, lead: Lead) -> tuple[str, str]:
        """Devolve (mensagem_1_abertura, mensagem_2_pitch). Nunca envia."""
        ...
