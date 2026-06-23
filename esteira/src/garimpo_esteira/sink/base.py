"""Contrato do sink — para onde a esteira lê/escreve.

Duas implementações: jsonfile (offline) e supabase (banco real). Trocar uma
pela outra não toca a cascata. Espelha as operações do schema (Fase 0).
"""
from __future__ import annotations

from typing import Protocol

from ..models import Lead, LeadStatus


class LeadSink(Protocol):
    def fetch_by_status(
        self, status: LeadStatus, limit: int, owner_id: str | None = None
    ) -> list[Lead]:
        """Leads num status (mais antigos primeiro). Se owner_id, so os do dono."""
        ...

    def fetch_redraft(self, limit: int, owner_id: str | None = None) -> list[Lead]:
        """Leads em rascunho_pronto ordenados por draft_generated_at (None primeiro)."""
        ...

    def fetch_backfill(self, limit: int, owner_id: str | None = None) -> list[Lead]:
        """Leads que tem site mas ainda faltam dados (facebook/instagram/whatsapp/
        ads_active), em qualquer status — alvo do backfill de re-enriquecimento."""
        ...

    def fetch_autopilot_profiles(self) -> list[dict]:
        """Perfis de busca com autopilot ligado (owner_id, niches, city, state...)."""
        ...

    def fetch_covered_keys(self, owner_id: str) -> list[tuple[str, str]]:
        """Pares (region_key, niche) ja varridos pelo dono (memoria de cobertura)."""
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

    def fetch_provenance(self, lead_id: str) -> list[dict]:
        """Proveniência do lead (inclui sinais que não são coluna, ex.: ads_active)."""
        ...

    def set_status(
        self, lead_id: str, to_status: LeadStatus, actor: str = "system", note: str | None = None
    ) -> None:
        ...

    def log_activity(
        self, owner_id: str, tipo: str, text: str, ref_count: int | None = None
    ) -> None:
        """Registra uma atividade no log do usuario. Efeito colateral; falha silenciosa."""
        ...

    def upsert_coverage(
        self,
        owner_id: str,
        region_key: str,
        niche: str,
        *,
        region_name: str | None = None,
        center_lat: float | None = None,
        center_lng: float | None = None,
        pct: float = 0,
        result_count: int = 0,
    ) -> None:
        """Upsert de cobertura de varredura por (owner_id, region_key, niche)."""
        ...
