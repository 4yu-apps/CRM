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
