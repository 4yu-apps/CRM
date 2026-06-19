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
    def fetch_by_status(self, status: LeadStatus, limit: int) -> list[Lead]:
        rows = [r for r in self._db["leads"].values() if r.get("status") == status]
        rows.sort(key=lambda r: r.get("created_at", ""))
        return [self._to_lead(r) for r in rows[:limit]]

    def get_lead(self, lead_id: str) -> Lead | None:
        raw = self._db["leads"].get(lead_id)
        return self._to_lead(raw) if raw else None

    def insert_lead(self, lead: Lead) -> str | None:
        key = dedup_key(lead.cnpj, lead.phone)
        if key:
            for r in self._db["leads"].values():
                if dedup_key(r.get("cnpj"), r.get("phone")) == key:
                    return None  # duplicata
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

    # ---- util ----
    def counts(self) -> dict[str, int]:
        out: dict[str, int] = {}
        for r in self._db["leads"].values():
            out[r["status"]] = out.get(r["status"], 0) + 1
        return out
