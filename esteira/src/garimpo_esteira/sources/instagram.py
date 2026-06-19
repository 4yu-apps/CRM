"""Fonte Instagram — normaliza o handle quando já veio do Maps/captação.

Descobrir IG do zero é frágil (ToS/anti-scraping). Aqui só consolidamos e
limpamos o handle existente; descoberta ativa fica fora do escopo da Fase 2.
"""
from __future__ import annotations

from ..models import Finding, Lead
from ..normalize import normalize_instagram


class InstagramSource:
    name = "instagram"

    def enrich(self, lead: Lead) -> list[Finding]:
        handle = normalize_instagram(lead.instagram)
        if not handle:
            return []
        return [Finding("instagram", self.name, handle, 0.7)]
