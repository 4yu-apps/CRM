"""Score do ICP em DOIS servicos (B1): regras puras, deterministas, EXPLICAVEIS.

Sem LLM: os criterios sao numeros concretos (nota, volume de avaliacoes,
descuido digital, "ja anuncia?", ramo de agendamento). Rule-based da score
explicavel ("por que esse lead pontuou X"), de graca e testavel. O LLM fica
pro rascunho.

Dois ICPs, um por servico:
- Trafego: nota boa + volume saudavel + descuido digital (sem site/IG) + nao
  anuncia. Tem cliente, falta visibilidade.
- Automacao: muito volume (muito cliente pra atender) + ramo de agendamento +
  WhatsApp como canal. Atende e agenda tudo na mao, da pra automatizar.

O alvo (service_target) sai da comparacao dos dois. score = o maior dos dois.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from .models import Lead, ServiceTarget
from .validation import is_present

THRESHOLD = 50    # >= qualificado; abaixo, descartado
AMBOS_BAR = 70    # os dois servicos fortes => alvo "ambos"

Decision = Literal["qualificado", "descartado"]

# Ramos onde o atendimento/agendamento manual pesa (ouro pra automacao).
_AGENDAMENTO_KEYWORDS = (
    "clinic", "clínic", "odonto", "dentista", "consultor", "saude", "saúde",
    "salao", "salão", "barbear", "estetic", "estétic", "spa", "studio", "estúdio",
    "pet", "veterin", "academia", "fisio", "psicolog", "advogad", "advocac",
    "imobiliar", "imobiliár", "escola", "curso", "auto escola", "autoescola",
)


# ---------------------------------------------------------------------
# blocos compartilhados
# ---------------------------------------------------------------------
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


def _contact_points(lead: Lead) -> tuple[int, str]:
    if is_present("phone", lead.phone):
        return 7, "tem telefone (WhatsApp)"
    return 0, "sem telefone"


def _is_agendamento(category: str | None) -> bool:
    if not category:
        return False
    cat = category.lower()
    return any(k in cat for k in _AGENDAMENTO_KEYWORDS)


# ---------------------------------------------------------------------
# ICP trafego: visibilidade pra quem ja tem cliente
# ---------------------------------------------------------------------
def score_trafego(lead: Lead, signals: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        crit.append({"label": label, "points": pts_note[0], "note": pts_note[1]})

    add("Nota", _rating_points(lead.rating))
    add("Avaliacoes", _reviews_points(lead.reviews_count))

    if is_present("website", lead.website):
        add("Site", (5, "ja tem site"))
    else:
        add("Site", (20, "sem site, mina de ouro p/ design/SEO"))
    if is_present("instagram", lead.instagram):
        add("Instagram", (3, "tem Instagram"))
    else:
        add("Instagram", (8, "sem presenca no Instagram"))

    ads = signals.get("ads_active")
    if ads is True:
        add("Anuncia?", (5, "ja anuncia, aquecido porem concorrido"))
    elif ads is False:
        add("Anuncia?", (15, "nao anuncia, oportunidade de trafego"))
    else:
        add("Anuncia?", (8, "anuncio desconhecido"))

    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# ICP automacao: operacao pra quem ja tem muito cliente
# ---------------------------------------------------------------------
def _auto_reviews_points(n: int | None) -> tuple[int, str]:
    if n is None:
        return 0, "sem volume de avaliacoes"
    if n >= 300:
        return 30, f"muito movimento ({n}), atendimento puxado"
    if n >= 150:
        return 22, f"bom movimento ({n})"
    if n >= 80:
        return 15, f"movimento medio ({n})"
    if n >= 30:
        return 8, f"movimento baixo ({n})"
    return 3, f"pouco movimento ({n})"


def _auto_rating_points(rating: float | None) -> tuple[int, str]:
    if rating is None:
        return 0, "sem nota no Maps"
    if rating >= 4.3:
        return 12, f"nota boa ({rating}), negocio rodando"
    if rating >= 4.0:
        return 8, f"nota ok ({rating})"
    return 3, f"nota baixa ({rating})"


def score_automacao(lead: Lead, signals: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        crit.append({"label": label, "points": pts_note[0], "note": pts_note[1]})

    add("Movimento", _auto_reviews_points(lead.reviews_count))
    add("Nota", _auto_rating_points(lead.rating))

    if _is_agendamento(lead.category):
        add("Ramo", (18, f"ramo de agendamento ({lead.category})"))
    else:
        add("Ramo", (8, "ramo sem agendamento obvio"))

    if is_present("website", lead.website):
        add("Canal", (6, "ja tem site, pode faltar chatbot"))
    else:
        add("Canal", (12, "sem site, atende tudo na mao"))

    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# decisao + motivo em PT
# ---------------------------------------------------------------------
@dataclass
class ScoreResult:
    score: int
    decision: Decision
    service_target: ServiceTarget
    reason: dict[str, Any]


def _summary(target: ServiceTarget, lead: Lead, signals: dict[str, Any]) -> str:
    nome = lead.business_name or "o negocio"
    sem_site = not is_present("website", lead.website)
    ads = signals.get("ads_active")
    nota, aval = lead.rating, lead.reviews_count

    movimento = ""
    if nota is not None and aval:
        movimento = f"nota {nota} com {aval} avaliacoes"
    elif aval:
        movimento = f"{aval} avaliacoes"

    if target == "trafego":
        extra = []
        if sem_site:
            extra.append("sem site")
        if ads is False:
            extra.append("nao anuncia")
        sinais = ", ".join([s for s in [movimento, *extra] if s])
        return (f"Trafego e o melhor alvo. {nome} tem {sinais}. "
                f"Da pra atrair cliente novo da regiao com anuncio local.").replace("  ", " ")
    if target == "automacao":
        ramo = f", {lead.category}" if lead.category else ""
        base = movimento or "bastante cliente"
        return (f"Automacao e o melhor alvo. {nome} tem {base}{ramo} e atende no WhatsApp. "
                f"Da pra montar um atendimento que responde e agenda sozinho.")
    if target == "ambos":
        return (f"Cabe trafego e automacao. {nome} tem movimento pra anunciar "
                f"e volume pra automatizar o atendimento.")
    return "Fora do alvo por agora."


def score_lead(lead: Lead, signals: dict[str, Any] | None = None) -> ScoreResult:
    signals = signals or {}
    t_score, t_crit = score_trafego(lead, signals)
    a_score, a_crit = score_automacao(lead, signals)
    best = max(t_score, a_score)

    contactable = is_present("phone", lead.phone)
    if not contactable:
        decision: Decision = "descartado"
        target: ServiceTarget = "indefinido"
        verdict = "sem telefone, nao da pra contatar no WhatsApp"
    elif best < THRESHOLD:
        decision = "descartado"
        target = "indefinido"
        verdict = "abaixo do corte do ICP nos dois servicos"
    else:
        decision = "qualificado"
        if t_score >= AMBOS_BAR and a_score >= AMBOS_BAR:
            target = "ambos"
        elif t_score >= a_score:
            target = "trafego"
        else:
            target = "automacao"
        verdict = "atingiu o corte do ICP"

    winning_crit = a_crit if target == "automacao" else t_crit

    reason = {
        "total": best,
        "threshold": THRESHOLD,
        "decision": decision,
        "verdict": verdict,
        "service_target": target,
        "summary": _summary(target, lead, signals),
        "criteria": winning_crit,
        "trafego": {"score": t_score, "criteria": t_crit},
        "automacao": {"score": a_score, "criteria": a_crit},
    }
    return ScoreResult(score=best, decision=decision, service_target=target, reason=reason)
