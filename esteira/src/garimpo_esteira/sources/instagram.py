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
from ..validation import clean

# probe(handle: str) -> dict | None
# dict = {"followers", "media_count", "last_post", "posts", "website", "engagement"}
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


def _parse_timestamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        dt = datetime.strptime(value, "%Y-%m-%dT%H:%M:%S%z")
    except (ValueError, TypeError):
        try:
            dt = datetime.fromisoformat(value)
        except (ValueError, TypeError):
            return None
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def post_frequency(
    timestamps: list[str] | None, *, now: datetime | None = None
) -> tuple[float | None, str | None]:
    """Deriva posts/semana e um label curto a partir dos ultimos posts.

    O label privilegia recencia quando ha pouca amostra e explicita abandono
    quando o ultimo post passou de 60 dias. Dados invalidos nao viram chute.
    """
    dates = sorted(
        (dt for dt in (_parse_timestamp(v) for v in (timestamps or [])) if dt),
        reverse=True,
    )
    if not dates:
        return None, None

    current = now or datetime.now(timezone.utc)
    if current.tzinfo is None:
        current = current.replace(tzinfo=timezone.utc)
    age_days = max(0, (current - dates[0]).days)
    if len(dates) < 2:
        if age_days > 60:
            months = max(2, round(age_days / 30))
            return None, f"parado há ~{months} meses"
        return None, "postou recentemente" if age_days <= 14 else "última postagem recente"

    span_days = max(1.0, (dates[0] - dates[-1]).total_seconds() / 86400)
    per_week = round((len(dates) - 1) * 7 / span_days, 2)
    if age_days > 60:
        months = max(2, round(age_days / 30))
        return per_week, f"parado há ~{months} meses"
    if per_week >= 0.75:
        shown = round(per_week)
        return per_week, f"≈{shown}x/semana"

    per_month = max(1, round(per_week * 30.44 / 7))
    if per_week >= 0.12:
        return per_week, f"≈{per_month}x/mês"
    return per_week, "postou recentemente" if age_days <= 14 else "posta de vez em quando"


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
        # mesma chamada (gratis) ja traz bio, site e engajamento dos ultimos posts.
        fields = (
            f"business_discovery.username({username})"
            "{followers_count,media_count,biography,website,"
            "media.limit(12){timestamp,like_count,comments_count}}"
        )
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
            posts = [m.get("timestamp") for m in media if m.get("timestamp")]
            inter = [
                (m.get("like_count") or 0) + (m.get("comments_count") or 0)
                for m in media
                if m.get("like_count") is not None or m.get("comments_count") is not None
            ]
            engagement = round(sum(inter) / len(inter), 1) if inter else None
            return {
                "followers": bd.get("followers_count"),
                "media_count": bd.get("media_count"),
                "last_post": last,
                "posts": posts,
                "website": bd.get("website"),
                "engagement": engagement,
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
        if data.get("last_post"):
            findings.append(Finding("instagram_last_post", self.name, data["last_post"], 0.8))
        freq, freq_label = post_frequency(data.get("posts"), now=self._now)
        if freq is not None:
            findings.append(Finding("instagram_post_freq", self.name, str(freq), 0.7))
        if freq_label:
            findings.append(Finding("instagram_post_freq_label", self.name, freq_label, 0.7))
        # site da bio do IG: enriquecimento de contato de graca (preenche a coluna
        # website quando o lead so tinha o @).
        site = clean("website", data.get("website"))
        if site:
            findings.append(Finding("website", self.name, site, 0.7))
        # engajamento medio dos ultimos posts: sinal pro lens marketing.
        if data.get("engagement") is not None:
            findings.append(Finding("instagram_engagement", self.name, str(data["engagement"]), 0.7))
        return findings
