"""Match rate — fração dos campos-alvo que a esteira conseguiu preencher."""
from __future__ import annotations

from collections.abc import Iterable

from .models import ENRICHABLE_FIELDS, Lead
from .validation import is_present

# Campos que mais importam pro ICP (telefone é o critério de aceite: >=80%).
DEFAULT_TARGETS = ("phone", "owner_name", "instagram", "website")


def match_rate(lead: Lead, targets: Iterable[str] = DEFAULT_TARGETS) -> float:
    targets = tuple(targets)
    if not targets:
        return 0.0
    hit = sum(1 for f in targets if is_present(f, lead.get(f)))
    return round(hit / len(targets), 3)


def filled_fields(lead: Lead) -> list[str]:
    return [f for f in ENRICHABLE_FIELDS if is_present(f, lead.get(f))]
