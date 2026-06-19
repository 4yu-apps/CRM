"""Contrato do sink — para onde a esteira lê/escreve.

Duas implementações: jsonfile (offline) e supabase (banco real). Trocar uma
pela outra não toca a cascata. Espelha as operações do schema (Fase 0).
"""
from __future__ import annotations

from typing import Protocol

from ..models import Lead, LeadStatus


class LeadSink(Protocol):
    def fetch_by_status(self, status: LeadStatus, limit: int) -> list[Lead]:
        """Leads num status (mais antigos primeiro)."""
        ...

    def get_lead(self, lead_id: str) -> Lead | None:
        ...

    def insert_lead(self, lead: Lead) -> str | None:
        """Insere com dedup. Retorna o id, ou None se for duplicata."""
        ...

    def record_provenance(
        self, lead_id: str, field_name: str, source: str, value: str | None, confidence: float | None
    ) -> None:
        """Upsert idempotente por (lead_id, field_name, source)."""
        ...

    def update_lead_fields(self, lead_id: str, fields: dict[str, object]) -> None:
        ...

    def set_status(
        self, lead_id: str, to_status: LeadStatus, actor: str = "system", note: str | None = None
    ) -> None:
        ...
