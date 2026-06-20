"""Sink em arquivo JSON — roda a esteira inteira offline, sem banco.

Reproduz o comportamento do schema: dedup por CNPJ/telefone, upsert idempotente
de proveniência e histórico de status. Útil pra desenvolver e provar a cascata.
"""
from __future__ import annotations

import json
from dataclasses import asdict, fields
from datetime import datetime, timezone
from pathlib import Path

from ..models import Lead, LeadStatus
from ..normalize import dedup_key

_LEAD_FIELDS = {f.name for f in fields(Lead)}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


class JsonFileSink:
    def __init__(self, path: str | Path):
        self.path = Path(path)
        self._db = self._load()

    # ---- persistência ----
    def _load(self) -> dict:
        if self.path.exists():
            return json.loads(self.path.read_text("utf-8"))
        return {"leads": {}, "provenance": [], "history": [], "_seq": 0}

    def _save(self) -> None:
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(json.dumps(self._db, ensure_ascii=False, indent=2), "utf-8")

    def _next_id(self, prefix: str) -> str:
        self._db["_seq"] += 1
        return f"{prefix}-{self._db['_seq']:05d}"

    def _to_lead(self, raw: dict) -> Lead:
        return Lead(**{k: v for k, v in raw.items() if k in _LEAD_FIELDS})

    # ---- LeadSink ----
    def fetch_by_status(
        self, status: LeadStatus, limit: int, owner_id: str | None = None
    ) -> list[Lead]:
        rows = [
            r for r in self._db["leads"].values()
            if r.get("status") == status and (owner_id is None or r.get("owner_id") == owner_id)
        ]
        rows.sort(key=lambda r: r.get("created_at", ""))
        return [self._to_lead(r) for r in rows[:limit]]

    def fetch_autopilot_profiles(self) -> list[dict]:
        return [p for p in self._db.get("profiles", []) if p.get("autopilot")]

    def fetch_covered_keys(self, owner_id: str) -> list[tuple[str, str]]:
        return [
            (c.get("region_key") or "", c.get("niche") or "")
            for c in self._db.get("coverage", [])
            if c.get("owner_id") == owner_id
        ]

    def upsert_profile(self, owner_id: str, **fields) -> None:
        """Util offline: define/atualiza o perfil de busca de um dono."""
        self._db.setdefault("profiles", [])
        for p in self._db["profiles"]:
            if p.get("owner_id") == owner_id:
                p.update(owner_id=owner_id, **fields)
                self._save()
                return
        self._db["profiles"].append({"owner_id": owner_id, **fields})
        self._save()

    def get_lead(self, lead_id: str) -> Lead | None:
        raw = self._db["leads"].get(lead_id)
        return self._to_lead(raw) if raw else None

    def insert_lead(self, lead: Lead) -> str | None:
        # dedup escopado ao dono (espelha os indices unicos (owner_id, ...) do schema)
        same_owner = [r for r in self._db["leads"].values() if r.get("owner_id") == lead.owner_id]
        key = dedup_key(lead.cnpj, lead.phone)
        if key:
            for r in same_owner:
                if dedup_key(r.get("cnpj"), r.get("phone")) == key:
                    return None  # duplicata por CNPJ/telefone (mesmo dono)
        if lead.maps_place_id:
            for r in same_owner:
                if r.get("maps_place_id") == lead.maps_place_id:
                    return None  # duplicata por place_id do Maps (mesmo dono)
        lead_id = lead.id or self._next_id("lead")
        raw = asdict(lead)
        raw["id"] = lead_id
        raw.setdefault("created_at", _now())
        raw["updated_at"] = _now()
        self._db["leads"][lead_id] = raw
        self._history(lead_id, None, raw.get("status", "bruto"), "system", None)
        self._save()
        return lead_id

    def record_provenance(self, lead_id, field_name, source, value, confidence) -> None:
        for p in self._db["provenance"]:
            if p["lead_id"] == lead_id and p["field_name"] == field_name and p["source"] == source:
                p.update(value=value, confidence=confidence, found_at=_now())
                self._save()
                return
        self._db["provenance"].append({
            "id": self._next_id("prov"), "lead_id": lead_id, "field_name": field_name,
            "source": source, "value": value, "confidence": confidence, "found_at": _now(),
        })
        self._save()

    def update_lead_fields(self, lead_id: str, fields_: dict[str, object]) -> None:
        raw = self._db["leads"].get(lead_id)
        if not raw:
            return
        for k, v in fields_.items():
            if k in _LEAD_FIELDS:
                raw[k] = v
        raw["updated_at"] = _now()
        self._save()

    def fetch_provenance(self, lead_id: str) -> list[dict]:
        return [p for p in self._db["provenance"] if p["lead_id"] == lead_id]

    def set_status(self, lead_id, to_status, actor="system", note=None) -> None:
        raw = self._db["leads"].get(lead_id)
        if not raw:
            return
        frm = raw.get("status")
        if frm == to_status:
            return
        raw["status"] = to_status
        raw["updated_at"] = _now()
        self._history(lead_id, frm, to_status, actor, note)
        self._save()

    def _history(self, lead_id, frm, to, actor, note) -> None:
        self._db["history"].append({
            "id": self._next_id("hist"), "lead_id": lead_id, "from_status": frm,
            "to_status": to, "actor": actor, "note": note, "changed_at": _now(),
        })

    def log_activity(
        self, owner_id: str, tipo: str, text: str, ref_count: int | None = None
    ) -> None:
        self._db.setdefault("activity", [])
        self._db["activity"].append({
            "id": self._next_id("act"),
            "owner_id": owner_id,
            "tipo": tipo,
            "text": text,
            "ref_count": ref_count,
            "created_at": _now(),
        })
        self._save()

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
        self._db.setdefault("coverage", [])
        record = {
            "owner_id": owner_id,
            "region_key": region_key,
            "niche": niche,
            "region_name": region_name,
            "center_lat": center_lat,
            "center_lng": center_lng,
            "pct": pct,
            "result_count": result_count,
            "covered_at": _now(),
        }
        for i, c in enumerate(self._db["coverage"]):
            if c["owner_id"] == owner_id and c["region_key"] == region_key and c["niche"] == niche:
                self._db["coverage"][i] = record
                self._save()
                return
        self._db["coverage"].append(record)
        self._save()

    # ---- util ----
    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in self._db["leads"].values():
            out[r["status"]] = out.get(r["status"], 0) + 1
        return out
