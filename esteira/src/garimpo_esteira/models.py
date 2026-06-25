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
    "google_maps", "openstreetmap", "cnpj_brasilapi", "cnpj_ws", "cnpj_lookup",
    "instagram", "website", "meta_ad_library", "manual", "extension", "biz_signals",
]

# Servico-alvo do lead, dirigido pela profissao do dono: trafego/automacao/ambos
# (gestor), design (UX/web/branding), marketing (social), ou indefinido.
ServiceTarget = Literal["trafego", "automacao", "ambos", "design", "marketing", "indefinido"]

# Campos do lead que as fontes podem preencher (proveniência por campo).
ENRICHABLE_FIELDS = (
    "phone", "whatsapp", "email", "instagram", "facebook", "website",
    "owner_name", "cnpj", "places_detailed_at", "opened_on",
    "company_status", "category", "porte", "capital_social", "socios_count",
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
    whatsapp: str | None = None       # WhatsApp separado: telefone nem sempre e o zap
    email: str | None = None
    instagram: str | None = None
    facebook: str | None = None       # pagina do Facebook (ponte pro page_id da Meta)
    website: str | None = None

    maps_place_id: str | None = None
    maps_url: str | None = None
    # coordenada do negocio (Places e OSM ja devolvem). Habilita mapa de leads e
    # dedup cross-fonte por proximidade (geo_dedup_key no banco).
    lat: float | None = None
    lng: float | None = None
    # horario de funcionamento (gratis do OSM; formato OSM). Base pro "melhor horario".
    opening_hours: str | None = None
    rating: float | None = None
    reviews_count: int | None = None
    category: str | None = None
    address: str | None = None
    neighborhood: str | None = None
    city: str | None = None
    state: str | None = None

    owner_name: str | None = None
    opt_out: bool = False
    # data de abertura da empresa (BrasilAPI data_inicio_atividade), ISO YYYY-MM-DD.
    # Alimenta o criterio "negocio novo" (O1): aberto ha pouco => precisa de marketing.
    opened_on: str | None = None
    # situacao cadastral na Receita (ATIVA/BAIXADA/INAPTA/SUSPENSA/NULA). Empresa
    # nao-ATIVA = corte duro no score (nao prospectar negocio morto).
    company_status: str | None = None
    # firmografia gratis da BrasilAPI (ja vinha na resposta, era descartada).
    porte: str | None = None
    capital_social: float | None = None
    socios_count: int | None = None
    # carimbo do enriquecimento via Google Places Details (contador da cota diaria)
    places_detailed_at: str | None = None

    # qualificação (Fase 3 + B1)
    score: int | None = None
    score_reason: dict[str, Any] | None = None
    service_target: ServiceTarget = "indefinido"
    ads_active: bool | None = None      # "ja anuncia?" (null = desconhecido)

    # sinais tecnicos do site, extraidos de graca do HTML (pixel, widget de chat,
    # form, mobile, peso, stack, og...). Alimentam o score por profissao e a ficha.
    site_signals: dict[str, Any] | None = None
    # retrato agregado de Instagram + anuncios para exibicao direta na ficha.
    # A proveniencia continua sendo a fonte auditavel campo a campo.
    social_signals: dict[str, Any] | None = None
    # cobertura de contatos achados no enriquecimento (0..1). Badge de "lead pobre".
    match_rate: float | None = None

    # precificação (B8): valor sugerido pela IA/heuristica (a humana decide)
    suggested_value: float | None = None
    suggested_value_reason: str | None = None

    # rascunho (Fase 3)
    draft_msg1: str | None = None
    draft_msg2: str | None = None
    draft_model: str | None = None
    draft_generated_at: str | None = None

    # quando o backfill re-enriqueceu por ultimo (rotacao: processa os mais
    # antigos primeiro, pra varrer todos os leads ao longo do tempo sem travar).
    backfilled_at: str | None = None

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
