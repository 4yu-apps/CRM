"""Sink Supabase — banco real via REST (PostgREST) com a service_role key.

service_role bypassa RLS (a esteira é server-side, sem usuário logado). Usa só
httpx — sem dependência extra. Inerte até existir env (SUPABASE_URL + key).
"""
from __future__ import annotations

import httpx

from ..models import Lead, LeadStatus

_LEAD_COLS = (
    "id", "owner_id", "status", "business_name", "cnpj", "phone", "email",
    "instagram", "website", "maps_place_id", "maps_url", "rating", "reviews_count",
    "category", "address", "neighborhood", "city", "state", "owner_name", "opt_out",
    "score", "score_reason", "draft_msg1", "draft_msg2", "draft_model", "draft_generated_at",
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

    def _to_lead(self, row: dict) -> Lead:
        return Lead(**{k: row.get(k) for k in _LEAD_COLS if k in row})

    def fetch_by_status(self, status: LeadStatus, limit: int) -> list[Lead]:
        r = self._client.get(
            f"{self.base}/leads",
            params={"status": f"eq.{status}", "order": "created_at.asc", "limit": str(limit)},
        )
        r.raise_for_status()
        return [self._to_lead(row) for row in r.json()]

    def get_lead(self, lead_id: str) -> Lead | None:
        r = self._client.get(f"{self.base}/leads", params={"id": f"eq.{lead_id}", "limit": "1"})
        r.raise_for_status()
        rows = r.json()
        return self._to_lead(rows[0]) if rows else None

    def insert_lead(self, lead: Lead) -> str | None:
        payload = {k: getattr(lead, k) for k in _LEAD_COLS if k != "id" and getattr(lead, k) is not None}
        payload.setdefault("owner_id", self.owner_id)
        r = self._client.post(
            f"{self.base}/leads", json=payload, headers={"Prefer": "return=representation"}
        )
        if r.status_code == 409:  # viola dedup (unique index)
            return None
        r.raise_for_status()
        rows = r.json()
        return rows[0]["id"] if rows else None

    def record_provenance(self, lead_id, field_name, source, value, confidence) -> None:
        r = self._client.post(
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
        r = self._client.patch(f"{self.base}/leads", params={"id": f"eq.{lead_id}"}, json=clean)
        r.raise_for_status()

    def fetch_provenance(self, lead_id: str) -> list[dict]:
        r = self._client.get(f"{self.base}/lead_field_provenance", params={"lead_id": f"eq.{lead_id}"})
        r.raise_for_status()
        return r.json()

    def set_status(self, lead_id, to_status, actor="system", note=None) -> None:
        # RPC do banco: valida transição + guarda LGPD + grava histórico.
        r = self._client.post(
            f"{self.base}/rpc/transition_lead",
            json={"p_lead_id": lead_id, "p_new_status": to_status, "p_actor": actor, "p_note": note},
        )
        r.raise_for_status()

    def close(self) -> None:
        self._client.close()
