"""Contrato de uma fonte da cascata."""
from __future__ import annotations

from typing import Protocol, runtime_checkable

from ..models import Finding, Lead


@runtime_checkable
class Source(Protocol):
    name: str

    def enrich(self, lead: Lead) -> list[Finding]:
        """Devolve achados para o lead. Campo ausente => sem finding (não erro)."""
        ...
