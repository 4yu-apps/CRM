"""Sink Supabase — banco real via REST (PostgREST) com a service_role key.

service_role bypassa RLS (a esteira é server-side, sem usuário logado). Usa só
httpx — sem dependência extra. Inerte até existir env (SUPABASE_URL + key).
"""
from __future__ import annotations

import time

import httpx

from ..models import Lead, LeadStatus

# Status que valem nova tentativa: rate limit (429) e instabilidade do servidor
# (5xx). 4xx de validacao sobem na hora — retry nao ajudaria.
_RETRY_STATUSES = {429, 500, 502, 503, 504}

_LEAD_COLS = (
    "id", "owner_id", "status", "business_name", "cnpj", "phone", "whatsapp", "email",
    "instagram", "facebook", "website", "maps_place_id", "maps_url", "rating", "reviews_count",
    "category", "address", "neighborhood", "city", "state", "owner_name", "opt_out",
    "opened_on",
    "score", "score_reason", "service_target", "ads_active",
    "site_signals", "match_rate",
    "suggested_value", "suggested_value_reason",
    "draft_msg1", "draft_msg2", "draft_model", "draft_generated_at",
    "backfilled_at", "places_detailed_at",
)


class SupabaseSink:
    def __init__(self, url: str, service_key: str, owner_id: str, timeout: float = 15.0):
        self.base = url.rstrip("/") + "/rest/v1"
        self.owner_id = owner_id
        self._client = httpx.Client(
            timeout=timeout,
            headers={
                "apikey": service_key,
                "Authorization": f"Bearer {service_key}",
                "Content-Type": "application/json",
            },
        )

    def _send(self, method: str, url: str, **kwargs) -> httpx.Response:
        """Chama o PostgREST com ate 3 tentativas e backoff exponencial (1s, 2s)
        em 429/5xx e erros de transporte. Mantem o lote vivo quando o Supabase
        tropeca — um soluco de rede nao prende mais leads em 'bruto'."""
        delay = 1.0
        r: httpx.Response | None = None
        for attempt in range(3):
            try:
                r = self._client.request(method, url, **kwargs)
            except httpx.HTTPError:
                if attempt == 2:
                    raise
                time.sleep(delay)
                delay *= 2
                continue
            if r.status_code in _RETRY_STATUSES and attempt < 2:
                time.sleep(delay)
                delay *= 2
                continue
            return r
        return r  # type: ignore[return-value]

    def _to_lead(self, row: dict) -> Lead:
        return Lead(**{k: row.get(k) for k in _LEAD_COLS if k in row})

    def fetch_by_status(
        self, status: LeadStatus, limit: int, owner_id: str | None = None
    ) -> list[Lead]:
        params = {"status": f"eq.{status}", "order": "created_at.asc", "limit": str(limit)}
        if owner_id:
            params["owner_id"] = f"eq.{owner_id}"
        r = self._send("GET", f"{self.base}/leads", params=params)
        r.raise_for_status()
        return [self._to_lead(row) for row in r.json()]

    def fetch_backfill(self, limit: int, owner_id: str | None = None) -> list[Lead]:
        # Tem site, nao e opt-out, e falta algum dado que o site costuma ter
        # (facebook/instagram/whatsapp) ou ainda nao checamos anuncio (ads_active).
        params = {
            "website": "not.is.null",
            "opt_out": "eq.false",
            "or": "(facebook.is.null,instagram.is.null,whatsapp.is.null)",
            # rotacao: os menos recentemente carimbados primeiro (nulos antes).
            # Sem isso, ordenar por created_at travaria nos antigos sem contato.
            "order": "backfilled_at.asc.nullsfirst",
            "limit": str(limit),
        }
        # Backfill e manutencao: por padrao varre TODOS os donos (service_role
        # ignora RLS). So escopa se o caller pedir explicitamente um owner_id —
        # senao ficaria preso ao OWNER_USER_ID do secret, que pode ser um dono
        # pequeno (foi o caso: o bulk dos leads e de outro dono).
        if owner_id:
            params["owner_id"] = f"eq.{owner_id}"
        r = self._send("GET", f"{self.base}/leads", params=params)
        r.raise_for_status()
        return [self._to_lead(row) for row in r.json()]

    def fetch_redraft(self, limit: int, owner_id: str | None = None) -> list[Lead]:
        """Leads em rascunho_pronto ordenados por draft_generated_at (None primeiro)."""
        params = {
            "status": "eq.rascunho_pronto",
            "order": "draft_generated_at.asc.nullsfirst",
            "limit": str(limit),
        }
        if owner_id:
            params["owner_id"] = f"eq.{owner_id}"
        r = self._send("GET", f"{self.base}/leads", params=params)
        r.raise_for_status()
        return [self._to_lead(row) for row in r.json()]

    def fetch_profile(self, owner_id: str) -> dict | None:
        """Perfil de um dono (pra busca direcionada saber a profissao/lente)."""
        try:
            r = self._send(
                "GET",
                f"{self.base}/search_profile",
                params={
                    "owner_id": f"eq.{owner_id}",
                    "select": "owner_id,niches,city,state,neighborhood,default_service_target,profession,professions,min_score",
                    "limit": "1",
                },
            )
            r.raise_for_status()
            rows = r.json()
            return rows[0] if rows else None
        except Exception:
            return None

    def fetch_autopilot_profiles(self) -> list[dict]:
        try:
            r = self._send(
                "GET",
                f"{self.base}/search_profile",
                params={
                    "autopilot": "eq.true",
                    "select": "owner_id,niches,city,state,neighborhood,radius,default_service_target,profession,professions,min_score",
                },
            )
            r.raise_for_status()
            return r.json()
        except Exception:
            return []

    def _count_places_since(self, start_iso: str) -> int:
        """Conta leads detalhados pelo Places desde start_iso (global). Usa o
        header count=exact do PostgREST."""
        try:
            r = self._send(
                "GET",
                f"{self.base}/leads",
                params={"places_detailed_at": f"gte.{start_iso}", "select": "id"},
                headers={"Prefer": "count=exact", "Range": "0-0"},
            )
            cr = r.headers.get("content-range", "")
            total = cr.split("/")[-1] if "/" in cr else ""
            return int(total) if total.isdigit() else len(r.json())
        except Exception:
            return 0

    def count_places_detailed_today(self) -> int:
        """Contador da cota DIARIA do Maps (global)."""
        from datetime import datetime, timezone

        return self._count_places_since(datetime.now(timezone.utc).strftime("%Y-%m-%dT00:00:00Z"))

    def count_places_detailed_this_month(self) -> int:
        """Contador do teto MENSAL do Maps (global); zera sozinho no dia 01."""
        from datetime import datetime, timezone

        return self._count_places_since(datetime.now(timezone.utc).strftime("%Y-%m-01T00:00:00Z"))

    def fetch_pending_owners(self) -> list[str]:
        """Donos com leads ainda no meio do funil (bruto/enriquecido/qualificado).
        Usado pelo drain pra processar capturas da extensao e stragglers de quem
        nao tem autopilot. Dedup no cliente (PostgREST nao faz DISTINCT direto)."""
        try:
            r = self._send(
                "GET",
                f"{self.base}/leads",
                params={
                    "status": "in.(bruto,enriquecido,qualificado)",
                    "select": "owner_id",
                    "limit": "5000",
                },
            )
            r.raise_for_status()
            seen: list[str] = []
            for row in r.json():
                oid = row.get("owner_id")
                if oid and oid not in seen:
                    seen.append(oid)
            return seen
        except Exception:
            return []

    def fetch_covered_keys(self, owner_id: str) -> list[tuple[str, str]]:
        try:
            r = self._send(
                "GET",
                f"{self.base}/scan_coverage",
                params={"owner_id": f"eq.{owner_id}", "select": "region_key,niche"},
            )
            r.raise_for_status()
            return [(row.get("region_key") or "", row.get("niche") or "") for row in r.json()]
        except Exception:
            return []

    def get_lead(self, lead_id: str) -> Lead | None:
        r = self._send("GET", f"{self.base}/leads", params={"id": f"eq.{lead_id}", "limit": "1"})
        r.raise_for_status()
        rows = r.json()
        return self._to_lead(rows[0]) if rows else None

    def insert_lead(self, lead: Lead) -> str | None:
        payload = {k: getattr(lead, k) for k in _LEAD_COLS if k != "id" and getattr(lead, k) is not None}
        payload.setdefault("owner_id", self.owner_id)
        r = self._send(
            "POST", f"{self.base}/leads", json=payload, headers={"Prefer": "return=representation"}
        )
        if r.status_code == 409:  # viola dedup (unique index)
            return None
        r.raise_for_status()
        rows = r.json()
        return rows[0]["id"] if rows else None

    def record_provenance(self, lead_id, field_name, source, value, confidence) -> None:
        r = self._send(
            "POST",
            f"{self.base}/lead_field_provenance",
            params={"on_conflict": "lead_id,field_name,source"},
            headers={"Prefer": "resolution=merge-duplicates"},
            json={
                "lead_id": lead_id, "field_name": field_name, "source": source,
                "value": value, "confidence": confidence,
            },
        )
        r.raise_for_status()

    def update_lead_fields(self, lead_id: str, fields_: dict[str, object]) -> None:
        clean = {k: v for k, v in fields_.items() if k in _LEAD_COLS}
        if not clean:
            return
        r = self._send("PATCH", f"{self.base}/leads", params={"id": f"eq.{lead_id}"}, json=clean)
        r.raise_for_status()

    def fetch_provenance(self, lead_id: str) -> list[dict]:
        r = self._send("GET", f"{self.base}/lead_field_provenance", params={"lead_id": f"eq.{lead_id}"})
        r.raise_for_status()
        return r.json()

    def set_status(self, lead_id, to_status, actor="system", note=None) -> None:
        # RPC do banco: valida transição + guarda LGPD + grava histórico.
        r = self._send(
            "POST",
            f"{self.base}/rpc/transition_lead",
            json={"p_lead_id": lead_id, "p_new_status": to_status, "p_actor": actor, "p_note": note},
        )
        r.raise_for_status()

    def log_activity(
        self, owner_id: str, tipo: str, text: str, ref_count: int | None = None
    ) -> None:
        try:
            payload: dict = {"owner_id": owner_id, "tipo": tipo, "text": text}
            if ref_count is not None:
                payload["ref_count"] = ref_count
            r = self._send("POST", f"{self.base}/activity_log", json=payload)
            r.raise_for_status()
        except Exception:
            pass  # log de atividade nao derruba o pipeline

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
        try:
            payload: dict = {
                "owner_id": owner_id,
                "region_key": region_key,
                "niche": niche,
                "pct": pct,
                "result_count": result_count,
            }
            if region_name is not None:
                payload["region_name"] = region_name
            if center_lat is not None:
                payload["center_lat"] = center_lat
            if center_lng is not None:
                payload["center_lng"] = center_lng
            r = self._send(
                "POST",
                f"{self.base}/scan_coverage",
                params={"on_conflict": "owner_id,region_key,niche"},
                headers={"Prefer": "resolution=merge-duplicates"},
                json=payload,
            )
            r.raise_for_status()
        except Exception:
            pass  # cobertura nao derruba o pipeline

    def close(self) -> None:
        self._client.close()
