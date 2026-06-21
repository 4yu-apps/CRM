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


_CEP = re.compile(r"\b\d{5}[-–]?\d{3}\b")
_CITY_UF = re.compile(r"^(.+?)\s*[-–]\s*([A-Z]{2})$")


def parse_address(formatted: str | None) -> tuple[str | None, str | None, str | None]:
    """Extrai (bairro, cidade, UF) do endereco formatado do Maps.

    Padrao BR: 'Rua X, 123 - Bairro, Cidade - UF, 01406-000, Brasil'. O Maps nao
    devolve bairro/cidade/UF em campos separados, mas o endereco formatado segue
    esse padrao, entao da pra puxar deles.
    """
    if not formatted:
        return (None, None, None)
    s = re.sub(r",?\s*(Brasil|Brazil)\s*$", "", formatted, flags=re.IGNORECASE)
    s = _CEP.sub("", s)
    parts = [p.strip() for p in s.split(",") if p.strip()]

    city = state = neighborhood = None
    city_idx = None
    for i, p in enumerate(parts):
        m = _CITY_UF.match(p)
        if m:
            city, state, city_idx = m.group(1).strip(), m.group(2), i
            break

    if city_idx is not None and city_idx >= 1:
        prev = parts[city_idx - 1]
        # 'Av. X, 123 - Jardim Paulista' -> 'Jardim Paulista'
        m2 = re.search(r"[-–]\s*(.+)$", prev)
        nb = (m2.group(1).strip() if m2 else prev).strip()
        if nb and not nb.isdigit():
            neighborhood = nb
    return (neighborhood, city, state)


@runtime_checkable
class MapsSource(Protocol):
    name: str

    def search(self, term: str) -> list[dict]:
        ...


def result_to_lead(raw: dict, owner_id: str) -> tuple[Lead, list[Finding]]:
    name = raw.get("name")
    phone = clean("phone", raw.get("formatted_phone_number") or raw.get("phone"))
    website = clean("website", raw.get("website"))
    address = raw.get("formatted_address") or raw.get("address")
    nb, ct, st = parse_address(address)
    lead = Lead(
        id="",
        owner_id=owner_id,
        status="bruto",
        business_name=name,
        phone=phone,
        website=website,
        rating=raw.get("rating"),
        reviews_count=raw.get("user_ratings_total") or raw.get("reviews_count"),
        category=raw.get("category"),
        address=address,
        neighborhood=raw.get("neighborhood") or nb,
        city=raw.get("city") or ct,
        state=raw.get("state") or st,
        maps_place_id=raw.get("place_id"),
        maps_url=raw.get("url"),
    )
    findings: list[Finding] = []
    if name:
        findings.append(Finding("business_name", "google_maps", name, 1.0))
    if phone:
        findings.append(Finding("phone", "google_maps", phone, 0.9))
    if website:
        findings.append(Finding("website", "google_maps", website, 0.95))
    if nb:
        findings.append(Finding("neighborhood", "google_maps", nb, 0.85))
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
    """Google Places (Text Search New). Gated por chave. ATENCAO: tem custo.

    Pagina ate max_pages (cada pagina ~20 resultados) via nextPageToken, pra
    passar do teto de 20 por chamada. O campo rating + userRatingCount cai na
    faixa Enterprise: 1 chamada traz ate 20 negocios COM nota/avaliacoes.
    """

    name = "places"
    URL = "https://places.googleapis.com/v1/places:searchText"
    # website, categoria e localizacao tambem vem do Maps (mesma faixa de preco,
    # ja que pedimos nota/telefone). So social/email/CNPJ e que nao vem do Maps.
    FIELDS = (
        "places.displayName,places.nationalPhoneNumber,places.rating,"
        "places.userRatingCount,places.formattedAddress,places.id,"
        "places.websiteUri,places.primaryTypeDisplayName,places.location,nextPageToken"
    )

    def __init__(
        self, api_key: str, timeout: float = 15.0, max_pages: int = 3, language: str = "pt-BR"
    ):
        self._key = api_key
        self._timeout = timeout
        self._max_pages = max_pages
        self._language = language

    def _fetch_page(self, term: str, page_token: str | None) -> tuple[list[dict], str | None]:
        """Uma pagina da busca. Retorna (places_brutos, proximo_token).

        Isolado pra testar a paginacao sem rede (monkeypatch deste metodo).
        """
        import httpx

        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self._key,
            "X-Goog-FieldMask": self.FIELDS,
        }
        body: dict = {"textQuery": term, "languageCode": self._language}
        if page_token:
            body["pageToken"] = page_token
        with httpx.Client(timeout=self._timeout) as client:
            r = client.post(self.URL, headers=headers, json=body)
            r.raise_for_status()
            data = r.json()
        return data.get("places", []), data.get("nextPageToken")

    @staticmethod
    def _to_raw(p: dict) -> dict:
        loc = p.get("location") or {}
        return {
            "name": (p.get("displayName") or {}).get("text"),
            "formatted_phone_number": p.get("nationalPhoneNumber"),
            "rating": p.get("rating"),
            "user_ratings_total": p.get("userRatingCount"),
            "formatted_address": p.get("formattedAddress"),
            "place_id": p.get("id"),
            "website": p.get("websiteUri"),
            "category": (p.get("primaryTypeDisplayName") or {}).get("text"),
            "lat": loc.get("latitude"),
            "lng": loc.get("longitude"),
        }

    def search(self, term: str) -> list[dict]:
        out: list[dict] = []
        token: str | None = None
        for _ in range(self._max_pages):
            places, token = self._fetch_page(term, token)
            out.extend(self._to_raw(p) for p in places)
            if not token:
                break
        return out
