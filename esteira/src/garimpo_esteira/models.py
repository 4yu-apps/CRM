"""Modelos do domínio — espelham o schema do Supabase (Fase 0)."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Literal

LeadStatus = Literal[
    "bruto", "enriquecido", "qualificado", "descartado",
    "rascunho_pronto", "aprovado", "enviado", "sem_resposta",
    "respondeu", "sem_interesse", "interessado", "reuniao",
    "proposta", "fechado", "perdido",
]

LeadSource = Literal[
    "google_maps", "cnpj_brasilapi", "cnpj_ws", "instagram",
    "website", "meta_ad_library", "manual", "extension",
]

# Servico-alvo do lead (B1): decidido pelo score (trafego x automacao x ambos).
ServiceTarget = Literal["trafego", "automacao", "ambos", "indefinido"]

# Campos do lead que as fontes podem preencher (proveniência por campo).
ENRICHABLE_FIELDS = (
    "phone", "email", "instagram", "website", "owner_name", "cnpj",
)


@dataclass
class Finding:
    """Um achado de uma fonte: 'a fonte X disse que o campo Y vale Z'."""
    field_name: str
    source: LeadSource
    value: str | None
    confidence: float | None = None


@dataclass
class Lead:
    id: str
    owner_id: str
    status: LeadStatus = "bruto"

    business_name: str | None = None
    cnpj: str | None = None
    phone: str | None = None
    email: str | None = None
    instagram: str | None = None
    website: str | None = None

    maps_place_id: str | None = None
    maps_url: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    category: str | None = None
    address: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None

    owner_name: str | None = None
    opt_out: bool = False

    # qualificação (Fase 3 + B1)
    score: int | None = None
    score_reason: dict[str, Any] | None = None
    service_target: ServiceTarget = "indefinido"
    ads_active: bool | None = None      # "ja anuncia?" (null = desconhecido)

    # precificação (B8): valor sugerido pela IA/heuristica (a humana decide)
    suggested_value: float | None = None
    suggested_value_reason: str | None = None

    # rascunho (Fase 3)
    draft_msg1: str | None = None
    draft_msg2: str | None = None
    draft_model: str | None = None
    draft_generated_at: str | None = None

    extra: dict[str, Any] = field(default_factory=dict)

    def get(self, name: str) -> Any:
        return getattr(self, name, None)


@dataclass
class EnrichResult:
    lead_id: str
    findings: list[Finding]
    fields_filled: list[str]
    match_rate: float
    new_status: LeadStatus
