"""Descoberta via OpenStreetMap/Overpass (O2). Gratis, sem chave, dados ODbL.

Corta a dependencia do Google Places (pago, teto 25/dia · 1.000/mes). E uma fonte
de DESCOBERTA de volume barato: nome, coordenada, e quando o OSM tem, telefone/
site/endereco. O enriquecimento (telefone, social, CNPJ) segue pelos motores
gratis que ja existem. Ressalva honesta: a cobertura do OSM no Brasil e mais
esparsa que na Europa; telefone/site vem com frequencia menor que no Places.

Implementa o contrato MapsSource (search(term) -> list[dict]), entao entra no
discover() no lugar do Places. A proveniencia dos achados vai como openstreetmap.
"""
from __future__ import annotations

from typing import Callable

import httpx

from ..models import LeadSource

OVERPASS_URL = "https://overpass-api.de/api/interpreter"

# fetch(overpass_ql) -> dict bruto da API | None
FetchFn = Callable[[str], dict | None]


def overpass_fetch(query: str, *, client: httpx.Client | None = None, timeout: float = 60.0) -> dict | None:
    own = client is None
    client = client or httpx.Client(timeout=timeout, headers={"User-Agent": "garimpo-esteira"})
    try:
        resp = client.post(OVERPASS_URL, data={"data": query})
        if resp.status_code != 200:
            return None
        return resp.json()
    except (httpx.HTTPError, ValueError):
        return None
    finally:
        if own:
            client.close()


# nicho (PT) -> tags OSM. Substring no nome do nicho; a ORDEM importa (regras mais
# especificas antes: 'barbear' antes de 'bar'). Vazio = cai no fallback por nome.
_OSM_FILTERS: list[tuple[tuple[str, ...], list[tuple[str, str]]]] = [
    (("barbear", "barbeiro"), [("shop", "hairdresser")]),
    (("salao", "salão", "cabeleire", "beleza"), [("shop", "hairdresser"), ("shop", "beauty")]),
    (("estetic", "estétic"), [("shop", "beauty")]),
    (("odonto", "dentist"), [("amenity", "dentist")]),
    (("clinic", "clínic", "consultor", "saude", "saúde"), [("amenity", "clinic"), ("amenity", "doctors")]),
    (("fisio", "psicolog"), [("amenity", "clinic")]),
    (("veterin", "petshop", "pet shop", "pet"), [("shop", "pet"), ("amenity", "veterinary")]),
    (("academia", "fitness", "crossfit"), [("leisure", "fitness_centre"), ("leisure", "sports_centre")]),
    (("pizzar", "restaurant"), [("amenity", "restaurant")]),
    (("lanchonet", "hamburg", "burger", "fast food", "lanche"), [("amenity", "fast_food")]),
    (("cafeteria", "café", "cafe", "coffee"), [("amenity", "cafe")]),
    (("padaria", "panific"), [("shop", "bakery")]),
    (("açaí", "acai", "sorvet", "geladaria"), [("amenity", "ice_cream")]),
    (("boteco", "pub", "bar"), [("amenity", "bar"), ("amenity", "pub")]),
    (("farmac", "farmác", "drogaria"), [("amenity", "pharmacy")]),
    (("supermerc", "minimerc", "mercearia", "mercado"), [("shop", "supermarket"), ("shop", "convenience")]),
    (("otica", "ótica", "oculos", "óculos"), [("shop", "optician")]),
    (("boutique", "vestuario", "vestuário", "roupa", "moda"), [("shop", "clothes")]),
    (("calçad", "calcad", "sapat"), [("shop", "shoes")]),
    (("oficina", "mecanic", "mecânic", "autocenter", "auto center", "funilaria"), [("shop", "car_repair")]),
    (("imobiliar", "imobiliár"), [("office", "estate_agent")]),
    (("advocac", "advogad"), [("office", "lawyer")]),
    (("contabil", "contábil", "contador"), [("office", "accountant")]),
    (("autoescola", "auto escola", "escola", "curso"), [("amenity", "driving_school"), ("amenity", "school")]),
    (("pousada", "hostel", "motel", "hotel"), [("tourism", "hotel"), ("tourism", "guest_house")]),
    (("tatuage", "tattoo"), [("shop", "tattoo")]),
    (("lavanderia",), [("shop", "laundry")]),
    (("floricultura", "floric"), [("shop", "florist")]),
]


def parse_term(term: str) -> tuple[str, str | None]:
    """Quebra 'nicho em [bairro,] cidade, UF' em (nicho, cidade). Sem ' em ' =
    (termo, None) e a busca nao roda (Overpass sem area varreria o planeta)."""
    s = (term or "").strip()
    low = s.lower()
    if " em " not in low:
        return s, None
    idx = low.index(" em ")
    niche = s[:idx].strip()
    parts = [p.strip() for p in s[idx + 4:].split(",") if p.strip()]
    if not parts:
        return niche, None
    # UF de 2 letras no fim -> a cidade e o penultimo; senao o ultimo pedaco
    if len(parts) >= 2 and len(parts[-1]) == 2 and parts[-1].isalpha():
        city = parts[-2]
    else:
        city = parts[-1]
    return niche, city or None


def osm_filters_for(niche: str) -> list[tuple[str, str]]:
    low = (niche or "").lower()
    for keys, filters in _OSM_FILTERS:
        if any(k in low for k in keys):
            return list(filters)
    return []


def build_query(niche: str, area: str, *, limit: int = 200, timeout: int = 25) -> str:
    filters = osm_filters_for(niche)
    if filters:
        body = "".join(f'  nwr["{k}"="{v}"](area.a);\n' for k, v in filters)
    else:
        # nicho sem mapeamento de tag: busca por nome (case-insensitive) na area
        safe = niche.replace('"', "")
        body = f'  nwr["name"~"{safe}",i](area.a);\n'
    return (
        f"[out:json][timeout:{timeout}];\n"
        f'area["name"="{area}"]->.a;\n'
        f"(\n{body});\n"
        f"out center tags {limit};\n"
    )


def _join_address(tags: dict) -> str | None:
    street = tags.get("addr:street")
    num = tags.get("addr:housenumber")
    line = " ".join(p for p in (street, num) if p)
    parts = [
        p for p in (line or None, tags.get("addr:suburb"), tags.get("addr:city"), tags.get("addr:state"))
        if p
    ]
    return ", ".join(parts) or None


def _category(tags: dict) -> str | None:
    for k in ("shop", "amenity", "leisure", "office", "tourism", "craft"):
        if tags.get(k):
            return str(tags[k]).replace("_", " ")
    return None


def element_to_raw(el: dict) -> dict | None:
    """Elemento Overpass -> raw no contrato da descoberta. Sem nome = None (POI
    sem identidade comercial nao vira lead)."""
    tags = el.get("tags") or {}
    name = tags.get("name")
    if not name:
        return None
    lat = el.get("lat")
    lng = el.get("lon")
    if lat is None or lng is None:
        center = el.get("center") or {}
        lat = center.get("lat")
        lng = center.get("lon")
    return {
        "name": name,
        "phone": tags.get("phone") or tags.get("contact:phone"),
        "website": tags.get("website") or tags.get("contact:website"),
        "address": _join_address(tags),
        "neighborhood": tags.get("addr:suburb") or tags.get("addr:neighbourhood"),
        "city": tags.get("addr:city"),
        "state": tags.get("addr:state"),
        "country": tags.get("addr:country"),
        "category": _category(tags),
        "lat": lat,
        "lng": lng,
        "place_id": f"osm:{el.get('type')}/{el.get('id')}",
        "url": f"https://www.openstreetmap.org/{el.get('type')}/{el.get('id')}",
    }


class OverpassSource:
    name = "overpass"
    # proveniencia gravada por campo (lida pelo discover via getattr)
    provenance_source: LeadSource = "openstreetmap"

    def __init__(self, fetch: FetchFn | None = None, *, limit: int = 200):
        self._fetch = fetch or overpass_fetch
        self._limit = limit

    def search(self, term: str) -> list[dict]:
        niche, area = parse_term(term)
        if not area:
            return []  # sem cidade no termo: nao roda (evitaria varrer o planeta)
        query = build_query(niche, area, limit=self._limit)
        try:
            data = self._fetch(query)
        except Exception:
            data = None
        if not data:
            return []
        out: list[dict] = []
        for el in data.get("elements") or []:
            raw = element_to_raw(el)
            if raw:
                out.append(raw)
        return out
