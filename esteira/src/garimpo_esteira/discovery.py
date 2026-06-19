"""Captação/descoberta (Maps -> bruto). Insere leads novos com dedup.

A API oficial do Maps entrega nome/nota/telefone/endereco — NUNCA social/email
(isso vem do enriquecimento). Aqui transformamos resultados de busca em leads
'bruto' com proveniência google_maps. Para varrer area densa sem bater no teto
de ~120, use grid.adaptive_grid antes de buscar (ver grid.py).

Fonte de resultados e injetada: fixture (offline) ou Places (gated por chave).
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Iterable, Protocol, runtime_checkable

from .models import Finding, Lead
from .validation import clean


def _region_key(term: str) -> str:
    """Gera chave estavel de regiao a partir do termo de busca."""
    return re.sub(r"[^a-z0-9]+", "-", term.lower()).strip("-")


@runtime_checkable
class MapsSource(Protocol):
    name: str

    def search(self, term: str) -> list[dict]:
        ...


def result_to_lead(raw: dict, owner_id: str) -> tuple[Lead, list[Finding]]:
    name = raw.get("name")
    phone = clean("phone", raw.get("formatted_phone_number") or raw.get("phone"))
    lead = Lead(
        id="",
        owner_id=owner_id,
        status="bruto",
        business_name=name,
        phone=phone,
        rating=raw.get("rating"),
        reviews_count=raw.get("user_ratings_total") or raw.get("reviews_count"),
        category=raw.get("category"),
        address=raw.get("formatted_address") or raw.get("address"),
        neighborhood=raw.get("neighborhood"),
        city=raw.get("city"),
        state=raw.get("state"),
        maps_place_id=raw.get("place_id"),
        maps_url=raw.get("url"),
    )
    findings: list[Finding] = []
    if name:
        findings.append(Finding("business_name", "google_maps", name, 1.0))
    if phone:
        findings.append(Finding("phone", "google_maps", phone, 0.9))
    return lead, findings


def discover(sink, maps_source: MapsSource, terms: Iterable[str], owner_id: str) -> dict:
    inserted, skipped = 0, 0
    for term in terms:
        results = maps_source.search(term)
        term_inserted = 0
        for raw in results:
            lead, findings = result_to_lead(raw, owner_id)
            lead_id = sink.insert_lead(lead)
            if not lead_id:  # dedup
                skipped += 1
                continue
            term_inserted += 1
            for f in findings:
                sink.record_provenance(lead_id, f.field_name, f.source, f.value, f.confidence)
        inserted += term_inserted
        if term_inserted > 0:
            try:
                sink.log_activity(
                    owner_id,
                    "busca",
                    f"Varri {term} e achei {term_inserted} negocios novos",
                    ref_count=term_inserted,
                )
            except Exception:
                pass
            try:
                rkey = _region_key(term)
                sink.upsert_coverage(
                    owner_id,
                    rkey,
                    term,
                    result_count=term_inserted,
                )
            except Exception:
                pass
    return {"inserted": inserted, "skipped": skipped}


class FixtureMapsSource:
    """Resultados de Maps de fixture (offline). dict {termo: [...]} com '*' fallback."""

    name = "fixture"

    def __init__(self, path: str | Path):
        self._data = json.loads(Path(path).read_text("utf-8"))

    def search(self, term: str) -> list[dict]:
        if isinstance(self._data, dict):
            return self._data.get(term, self._data.get("*", []))
        return self._data


class PlacesMapsSource:
    """Google Places (Text Search). Gated por chave. ATENCAO: tem custo (nao R$0).
    Para R$0, a captacao vem pela extensao (varredura do Maps). Estrutural."""

    name = "places"

    def __init__(self, api_key: str, timeout: float = 15.0):
        self._key = api_key
        self._timeout = timeout

    def search(self, term: str) -> list[dict]:
        import httpx

        url = "https://places.googleapis.com/v1/places:searchText"
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self._key,
            "X-Goog-FieldMask": "places.displayName,places.nationalPhoneNumber,places.rating,"
            "places.userRatingCount,places.formattedAddress,places.id",
        }
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(url, headers=headers, json={"textQuery": term})
            r.raise_for_status()
            places = r.json().get("places", [])
        return [
            {
                "name": (p.get("displayName") or {}).get("text"),
                "formatted_phone_number": p.get("nationalPhoneNumber"),
                "rating": p.get("rating"),
                "user_ratings_total": p.get("userRatingCount"),
                "formatted_address": p.get("formattedAddress"),
                "place_id": p.get("id"),
            }
            for p in places
        ]
