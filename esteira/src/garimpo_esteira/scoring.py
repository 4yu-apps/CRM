"""Score do ICP: regras puras, determinísticas e EXPLICÁVEIS.

Sem LLM: os critérios do ICP são números concretos (nota, volume de
avaliações, descuido digital, já anuncia). Rule-based dá score explicável
("por que esse lead pontuou X"), de graça e testável. O LLM fica pro rascunho.

ICP (seção 8 do mapa): nota 4,3+, 80-800 avaliações, sinais de descuido
digital (sem site / IG fraco = ouro pra quem vende design/SEO), e "já anuncia?".
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .models import Lead
from .validation import is_present

THRESHOLD = 50  # >= qualificado; abaixo, descartado

Decision = Literal["qualificado", "descartado"]


@dataclass
class ScoreResult:
    score: int
    decision: Decision
    reason: dict[str, Any]


def _rating_points(rating: float | None) -> tuple[int, str]:
    if rating is None:
        return 0, "sem nota no Maps"
    if rating >= 4.7:
        return 25, f"nota alta ({rating})"
    if rating >= 4.3:
        return 20, f"nota boa ({rating}), dentro do ICP"
    if rating >= 4.0:
        return 10, f"nota ok ({rating})"
    return 0, f"nota baixa ({rating}), fora do ICP"


def _reviews_points(n: int | None) -> tuple[int, str]:
    if n is None:
        return 0, "sem volume de avaliacoes"
    if 80 <= n <= 800:
        return 25, f"volume ideal ({n}), 80-800"
    if 30 <= n < 80:
        return 12, f"volume baixo ({n})"
    if 800 < n <= 2000:
        return 12, f"volume alto ({n})"
    if n > 2000:
        return 5, f"grande/saturado ({n})"
    return 3, f"poucas avaliacoes ({n})"


def _digital_neglect_points(lead: Lead) -> list[tuple[int, str]]:
    out: list[tuple[int, str]] = []
    if is_present("website", lead.website):
        out.append((5, "ja tem site"))
    else:
        out.append((20, "sem site, mina de ouro p/ design/SEO"))
    if is_present("instagram", lead.instagram):
        out.append((3, "tem Instagram"))
    else:
        out.append((8, "sem presenca no Instagram"))
    return out


def _ads_points(ads_active: bool | None) -> tuple[int, str]:
    if ads_active is True:
        return 5, "ja anuncia, aquecido porem concorrido"
    if ads_active is False:
        return 15, "nao anuncia, oportunidade de trafego"
    return 8, "anuncio desconhecido"


def score_lead(lead: Lead, signals: dict[str, Any] | None = None) -> ScoreResult:
    signals = signals or {}
    criteria: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        pts, note = pts_note
        criteria.append({"label": label, "points": pts, "note": note})

    add("Nota", _rating_points(lead.rating))
    add("Avaliacoes", _reviews_points(lead.reviews_count))
    for pts_note in _digital_neglect_points(lead):
        label = "Site" if "site" in pts_note[1] else "Instagram"
        add(label, pts_note)
    add("Anuncia?", _ads_points(signals.get("ads_active")))

    contactable = is_present("phone", lead.phone)
    add("Contato", (7, "tem telefone (WhatsApp)") if contactable else (0, "sem telefone"))

    total = sum(c["points"] for c in criteria)

    # regra dura: sem telefone não dá pra contatar no WhatsApp -> descarta
    if not contactable:
        decision: Decision = "descartado"
        verdict = "sem telefone, nao da pra contatar no WhatsApp"
    else:
        decision = "qualificado" if total >= THRESHOLD else "descartado"
        verdict = "atingiu o corte do ICP" if decision == "qualificado" else "abaixo do corte do ICP"

    reason = {
        "total": total,
        "threshold": THRESHOLD,
        "decision": decision,
        "verdict": verdict,
        "criteria": criteria,
    }
    return ScoreResult(score=total, decision=decision, reason=reason)
