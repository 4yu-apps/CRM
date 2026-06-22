"""Fonte Instagram. Normaliza o handle e consulta a Graph API via Business Discovery.

Business Discovery e a forma oficial (e gratis) de ler dados publicos de perfis
profissionais sem scraping. Requer uma pagina do Facebook vinculada ao IG Business.
Sem token/business_id, a fonte fica inerte no modo basico (so normaliza o handle),
igual ao comportamento anterior. Conservador: sem dado confiavel, nao chuta.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Callable

from ..models import Finding, Lead
from ..normalize import normalize_instagram

# probe(handle: str) -> dict | None
# dict = {"followers": int|None, "media_count": int|None, "last_post": str|None}
ProbeFn = Callable[[str], dict | None]

GRAPH_URL = "https://graph.facebook.com/v21.0"


def instagram_status(last_post_iso: str | None, *, now: datetime | None = None, stale_days: int = 60) -> str | None:
    """Devolve "ativo" / "parado" / None a partir do timestamp do ultimo post.

    Formato IG: "2024-03-15T12:00:00+0000". Tenta strptime primeiro (mais robusto
    com o offset +0000), cai no fromisoformat como fallback. Sem data valida => None.
    now injetavel pra teste; default datetime.now(timezone.utc).
    """
    if not last_post_iso:
        return None
    dt = None
    try:
        dt = datetime.strptime(last_post_iso, "%Y-%m-%dT%H:%M:%S%z")
    except (ValueError, TypeError):
        pass
    if dt is None:
        try:
            dt = datetime.fromisoformat(last_post_iso)
        except (ValueError, TypeError):
            return None
    # garante timezone-aware pra subtracao nao estourar
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    _now = now if now is not None else datetime.now(timezone.utc)
    delta = _now - dt
    return "parado" if delta.days > stale_days else "ativo"


def business_discovery_probe(ig_business_id: str, token: str, *, timeout: float = 10.0, get=None) -> ProbeFn:
    """Probe real via Business Discovery API. `get` injetavel pra teste; em producao usa httpx.

    Requer uma pagina do Facebook (ig_business_id) vinculada ao Instagram Business.
    Sem token ou business_id, build_sources deixa a fonte sem probe (modo basico).
    """
    import httpx

    _get = get or httpx.get

    def probe(handle: str) -> dict | None:
        # a API quer o username cru, sem o @ que normalize_instagram devolve
        username = handle.lstrip("@")
        fields = f"business_discovery.username({username}){{followers_count,media_count,media.limit(1){{timestamp}}}}"
        try:
            r = _get(
                f"{GRAPH_URL}/{ig_business_id}",
                params={"fields": fields, "access_token": token},
                timeout=timeout,
            )
            if r.status_code != 200:
                return None
            bd = r.json().get("business_discovery")
            if not bd:
                return None
            media = (bd.get("media") or {}).get("data") or []
            last = media[0].get("timestamp") if media else None
            return {
                "followers": bd.get("followers_count"),
                "media_count": bd.get("media_count"),
                "last_post": last,
            }
        except Exception:
            return None

    return probe


class InstagramSource:
    name = "instagram"

    def __init__(self, probe: ProbeFn | None = None, *, stale_days: int = 60, now: datetime | None = None):
        self._probe = probe
        self._stale_days = stale_days
        self._now = now

    def enrich(self, lead: Lead) -> list[Finding]:
        handle = normalize_instagram(lead.instagram)
        if not handle:
            return []
        findings = [Finding("instagram", self.name, handle, 0.7)]
        if self._probe is None:
            return findings  # sem token: so normaliza (comportamento anterior)
        data = self._probe(handle)
        if not data:
            return findings  # inacessivel/privada/pessoal: desconhecido, nao chuta
        if data.get("followers") is not None:
            findings.append(Finding("instagram_followers", self.name, str(data["followers"]), 0.8))
        if data.get("media_count") is not None:
            findings.append(Finding("instagram_media_count", self.name, str(data["media_count"]), 0.8))
        status = instagram_status(data.get("last_post"), now=self._now, stale_days=self._stale_days)
        if status:
            findings.append(Finding("instagram_status", self.name, status, 0.7))
        return findings
