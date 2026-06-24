"""Fonte Places Details: preenche TELEFONE e SITE de leads capturados pela
extensao (que vem do DOM do Maps, sem telefone). Usa o maps_place_id pra chamar
a Places API (New). Sem telefone o lead seria descartado, entao isso destrava as
capturas.

CUSTO: telefone/site sao campos do SKU Enterprise da Places API (1.000 chamadas
GRATIS por mes ~= 30/dia). Pra nunca estourar a cota paga, a fonte respeita um
LIMITE DIARIO (count_today conta quantos leads ja foram detalhados hoje); quando
bate, para de chamar e avisa "tenta amanha". So gasta cota em lead que precisa
(sem telefone, com place_id).
"""
from __future__ import annotations

from datetime import datetime, timezone

from ..models import Finding, Lead
from ..validation import is_present


def place_details_fetch(api_key: str, timeout: float = 10.0):
    """Probe real: place_id -> {'phone', 'website'} via Places API (New).
    FieldMask pede so os campos de contato (minimiza o custo/SKU)."""
    import httpx

    client = httpx.Client(timeout=timeout)

    def fetch(place_id: str) -> dict:
        r = client.get(
            f"https://places.googleapis.com/v1/places/{place_id}",
            headers={
                "X-Goog-Api-Key": api_key,
                "X-Goog-FieldMask": "internationalPhoneNumber,nationalPhoneNumber,websiteUri",
            },
        )
        r.raise_for_status()
        d = r.json()
        return {
            "phone": d.get("nationalPhoneNumber") or d.get("internationalPhoneNumber"),
            "website": d.get("websiteUri"),
        }

    return fetch


class PlacesDetailsSource:
    """Preenche telefone/site via place_id, respeitando a cota diaria do Maps."""

    name = "places_details"

    def __init__(self, fetch, *, daily_limit: int, count_today,
                 monthly_limit: int = 0, count_month=None):
        self._fetch = fetch
        self._limit = daily_limit
        self._count_today = count_today  # callable -> int (quanto ja gastou hoje)
        self._monthly_limit = monthly_limit  # teto duro do mes (0 = sem teto)
        self._count_month = count_month  # callable -> int (quanto ja gastou no mes)
        self._used_today_initial: int | None = None
        self._used_month_initial: int | None = None
        self._used_run = 0
        self._warned = False

    @staticmethod
    def _safe(fn) -> int:
        try:
            return int(fn())
        except Exception:
            return 0

    def _budget_left(self) -> int:
        if self._used_today_initial is None:
            self._used_today_initial = self._safe(self._count_today)
        left = self._limit - self._used_today_initial - self._used_run
        # teto mensal: religa sozinho no dia 01 (a contagem do mes zera).
        if self._monthly_limit and self._count_month is not None:
            if self._used_month_initial is None:
                self._used_month_initial = self._safe(self._count_month)
            left = min(left, self._monthly_limit - self._used_month_initial - self._used_run)
        return left

    def enrich(self, lead: Lead) -> list[Finding]:
        # So gasta cota quando faz sentido: sem telefone, mas com place_id.
        if is_present("phone", lead.phone) or not lead.maps_place_id:
            return []
        if self._budget_left() <= 0:
            if not self._warned:
                print("places_details: cota do Maps batida (dia/mes); pausando "
                      "(religa amanha ou no dia 01 do mes).")
                self._warned = True
            return []
        try:
            data = self._fetch(lead.maps_place_id) or {}
        except Exception:
            return []  # falha da API nao derruba a cascata
        self._used_run += 1
        now = datetime.now(timezone.utc).isoformat()
        # carimbo sempre (conta a cota gasta), mesmo se nao veio telefone/site
        findings = [Finding("places_detailed_at", "google_maps", now, 1.0)]
        if data.get("phone"):
            findings.append(Finding("phone", "google_maps", str(data["phone"]), 0.95))
        if data.get("website"):
            findings.append(Finding("website", "google_maps", str(data["website"]), 0.9))
        return findings
