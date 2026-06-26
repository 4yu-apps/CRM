"""Fonte Meta Ad Library — 'o lead já anuncia?' (sinal de qualificação).

Anota proveniência ads_active (sim/nao), ads_count, ads_since e as plataformas
(facebook/instagram...). Requer token da Ad Library API; sem token, fica inerte.

CAMINHOS (do mais confiável pro fallback):
 1. fb_page_id já salvo no lead -> pergunta direto (preciso, rápido).
 2. facebook raspado do site (rodapé etc) -> resolve o page_id -> pergunta.
 3. SEM página: busca por nome (search_terms) no Brasil e SÓ aceita se o
    page_name do resultado casar (fuzzy) com o nome do lead. Isso evita o ruído
    do search_terms (que casa o TEXTO do anúncio, não o anunciante). Nunca marca
    "não anuncia" por busca vazia — só promove desconhecido -> sim, sem chute.

No Brasil a Ad Library expõe anúncio ATIVO agora (sem histórico de inativo), o que
basta pro "anuncia?". Quando acha por nome, devolve também o page_id pra salvar e
acelerar a próxima checagem.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Callable

from ..models import Finding, Lead

# probe(lead) -> dict {active,count,since,platforms,page_id} | bool (legado) | None
ProbeFn = Callable[[Lead], "dict | bool | None"]

GRAPH_URL = "https://graph.facebook.com/v23.0"
AD_ARCHIVE_URL = f"{GRAPH_URL}/ads_archive"

# palavras genéricas que não ajudam a casar o nome (ramo, não a marca)
_GENERIC = {
    "barbearia", "salao", "salão", "studio", "estudio", "clinica", "clínica",
    "academia", "pizzaria", "restaurante", "lanchonete", "loja", "centro",
    "espaco", "espaço", "atelie", "bar", "cafe", "café", "petshop",
    "pet", "shop", "the", "de", "do", "da", "dos", "das",
}


def _norm(s: str | None) -> str:
    """minúsculas, sem acento, só letras/números/espaço."""
    t = unicodedata.normalize("NFKD", s or "").encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9 ]+", " ", t.lower()).strip()


def _tokens(s: str | None) -> set[str]:
    return {w for w in _norm(s).split() if len(w) > 2 and w not in _GENERIC}


def _name_match(business_name: str | None, page_name: str | None) -> bool:
    """Casa o nome do lead com o page_name do anunciante, ignorando palavras de
    ramo. Conservador (evita falso-positivo): todos os tokens distintos do menor
    nome precisam aparecer no outro."""
    a, b = _tokens(business_name), _tokens(page_name)
    if not a or not b:
        return False
    return len(a & b) >= min(len(a), len(b))


def resolve_page_id(facebook: str | None, token: str, get, timeout: float) -> str | None:
    """facebook pode ser id numérico (usa direto) ou slug/vanity/URL (resolve pelo
    Graph: GET /{slug}?fields=id). Aceita URL completa (rodapé do site). Falha -> None."""
    fb = (facebook or "").strip().strip("/")
    fb = re.sub(r"^https?://(www\.)?facebook\.com/", "", fb, flags=re.I).strip("/")
    fb = fb.split("?")[0].split("/")[0]
    if not fb:
        return None
    if fb.isdigit():
        return fb
    try:
        r = get(f"{GRAPH_URL}/{fb}", params={"fields": "id", "access_token": token}, timeout=timeout)
        if r.status_code != 200:
            return None
        return r.json().get("id")
    except Exception:
        return None


def _platforms(data: list[dict]) -> list[str]:
    out: list[str] = []
    for d in data:
        for p in d.get("publisher_platforms") or []:
            if p and p.lower() not in out:
                out.append(p.lower())
    return out


def has_ads_info(page_id: str, token: str, get, country: str, timeout: float) -> dict | None:
    """Intensidade do anúncio: {active, count, since, platforms}. count = anúncios
    ativos (até o limite); since = início do mais antigo; platforms = onde rodam.
    None se a API não responde."""
    try:
        r = get(
            AD_ARCHIVE_URL,
            params={
                "search_page_ids": f'["{page_id}"]',
                "ad_reached_countries": f'["{country}"]',
                "ad_active_status": "ACTIVE",
                "ad_type": "ALL",
                "fields": "id,ad_delivery_start_time,publisher_platforms",
                "limit": "25",
                "access_token": token,
            },
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        data = r.json().get("data", [])
        if not data:
            return {"active": False, "count": 0, "since": None, "platforms": []}
        starts = [d.get("ad_delivery_start_time") for d in data if d.get("ad_delivery_start_time")]
        return {
            "active": True,
            "count": len(data),
            "since": min(starts) if starts else None,
            "platforms": _platforms(data),
        }
    except Exception:
        return None


def has_active_ads(page_id: str, token: str, get, country: str, timeout: float) -> bool | None:
    """True se a página tem >=1 anúncio ATIVO no país. None se a API não responde."""
    info = has_ads_info(page_id, token, get, country, timeout)
    return None if info is None else info["active"]


def search_by_name(business_name: str | None, token: str, get, country: str, timeout: float) -> dict | None:
    """Fallback sem página: busca por nome no país e só aceita se o page_name de
    algum resultado casar com o nome do lead. Devolve {active,count,since,
    platforms,page_id} do anunciante casado, ou None (sem match = desconhecido)."""
    if not _tokens(business_name):
        return None
    try:
        r = get(
            AD_ARCHIVE_URL,
            params={
                "search_terms": business_name,
                "ad_reached_countries": f'["{country}"]',
                "ad_active_status": "ACTIVE",
                "ad_type": "ALL",
                "fields": "page_id,page_name,ad_delivery_start_time,publisher_platforms",
                "limit": "50",
                "access_token": token,
            },
            timeout=timeout,
        )
        if r.status_code != 200:
            return None
        data = r.json().get("data", [])
    except Exception:
        return None
    matched = [d for d in data if _name_match(business_name, d.get("page_name"))]
    if not matched:
        return None  # sem anunciante batendo o nome: desconhecido (nada de chute)
    page_id = next((d.get("page_id") for d in matched if d.get("page_id")), None)
    starts = [d.get("ad_delivery_start_time") for d in matched if d.get("ad_delivery_start_time")]
    return {
        "active": True,
        "count": len(matched),
        "since": min(starts) if starts else None,
        "platforms": _platforms(matched),
        "page_id": page_id,
    }


def meta_ads_probe(
    token: str, *, country: str = "BR", timeout: float = 10.0, get=None, name_search: bool = False
) -> ProbeFn:
    """Probe real da Ad Library API. Tenta page_id salvo -> facebook do site (só
    resolve se o app tiver 'Page Public Content Access'; senão o Graph nega) ->
    busca por nome (opt-in, `name_search`: search_terms é ruidoso e gasta 1
    chamada/lead, risco de 429). Devolve dict de intensidade ou None. `get`
    injetável pra teste."""
    import httpx

    _get = get or httpx.get

    def probe(lead: Lead) -> dict | None:
        page_id = (lead.fb_page_id or "").strip() or resolve_page_id(lead.facebook, token, _get, timeout)
        if page_id:
            info = has_ads_info(page_id, token, _get, country, timeout)
            if info is not None:
                info.setdefault("page_id", page_id)
            return info
        if name_search:
            # fallback por nome (só aceita com match de page_name; nada de chute)
            return search_by_name(lead.business_name, token, _get, country, timeout)
        return None

    return probe


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
        if isinstance(result, bool):  # probe legado
            active, count, since, platforms, page_id = result, None, None, None, None
        else:
            active = result.get("active")
            count, since = result.get("count"), result.get("since")
            platforms, page_id = result.get("platforms"), result.get("page_id")
            if active is None:
                return []
        findings = [Finding("ads_active", self.name, "sim" if active else "nao", 0.8)]
        if active and count:
            findings.append(Finding("ads_count", self.name, str(count), 0.7))
        if active and since:
            findings.append(Finding("ads_since", self.name, since, 0.7))
        if active and platforms:
            import json
            findings.append(Finding("ad_platforms", self.name, json.dumps(platforms), 0.8))
        # guarda o page_id achado: próxima checagem é direta (só se ainda não temos)
        if page_id and not lead.fb_page_id:
            findings.append(Finding("fb_page_id", self.name, str(page_id), 0.9))
        return findings
