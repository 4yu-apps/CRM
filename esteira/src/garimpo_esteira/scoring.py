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


# Sinais tecnicos do site (extraidos de graca do HTML em sources/website.py).
# Chegam em signals["site"] como dict. Ausencia = None (desconhecido), nao False.
def _sig(signals: dict[str, Any] | None, key: str, default: Any = None) -> Any:
    site = (signals or {}).get("site") or {}
    return site.get(key, default)


# Profissao do dono -> lente de ICP usada pra pontuar. Espelha professions.ts.
# design/web/branding olham qualidade do site; marketing olha presenca/redes;
# trafego/automacao/ambos mantem os ICPs originais; o resto cai no "auto"
# (compara trafego x automacao, comportamento legado).
_LENS = {
    "trafego": "trafego",
    "automacao": "automacao",
    "ambos": "ambos",
    "design": "design",
    "web": "design",
    "branding": "design",
    "marketing": "marketing",
}


def lens_for(profession: str | None) -> str:
    return _LENS.get((profession or "").strip().lower(), "auto")


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

    # "Ja anuncia?": vem de graca do PIXEL DE ANUNCIO no HTML (Meta/Google Ads/
    # TikTok). Analytics (GA/GTM) NAO conta — quase todo site mede e isso daria
    # falso "ja anuncia". ad_platforms e a lista canonica; os has_* sao fallback
    # pra sinais antigos ja gravados.
    ads = signals.get("ads_active")
    pixel = bool(_sig(signals, "ad_platforms")) or _sig(signals, "has_fb_pixel") \
        or _sig(signals, "has_google_ads") or _sig(signals, "has_tiktok_pixel")
    if ads is True or pixel:
        add("Anuncia?", (6, "ja tem rastreamento de anuncio (Pixel/tag), aquecido"))
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

    # Chatbot/widget no site (sinal de graca do HTML): se NAO tem widget, atende
    # na mao = ouro pra automacao; se ja tem, esta meio resolvido.
    widget = _sig(signals, "has_chat_widget")
    if widget is False:
        add("Atendimento", (12, "sem chatbot no site, responde tudo na mao"))
    elif widget is True:
        vendor = _sig(signals, "chat_vendor") or "widget"
        add("Atendimento", (4, f"ja tem {vendor} no site (semi-automatizado)"))
    if _sig(signals, "has_form") is True:
        add("Captura", (4, "tem formulario no site, da pra integrar/automatizar"))

    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# ICP design/web/branding: qualidade do site (tudo de graca do HTML)
# Site fraco/ausente = oportunidade. Quanto pior o site, melhor o lead.
# ---------------------------------------------------------------------
def score_design(lead: Lead, signals: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        crit.append({"label": label, "points": pts_note[0], "note": pts_note[1]})

    if not is_present("website", lead.website):
        add("Site", (45, "sem site, oportunidade de criar do zero"))
    else:
        add("Site", (8, "tem site, da pra avaliar a qualidade"))
        if _sig(signals, "mobile_ready") is False:
            add("Mobile", (16, "site sem viewport, nao adaptado pra celular"))
        elif _sig(signals, "mobile_ready") is True:
            add("Mobile", (2, "site responsivo"))
        if _sig(signals, "slow") is True:
            add("Peso", (12, "site pesado/lento"))
        # performance real do PageSpeed (Google, gratis), quando medida: nota
        # baixa no celular = argumento de redesign forte e objetivo.
        ps = _sig(signals, "perf_score")
        if isinstance(ps, (int, float)) and ps < 50:
            add("Performance", (12, f"PageSpeed {ps}/100 no celular, lento de verdade"))
        stack = _sig(signals, "stack")
        if stack in ("wix", "wordpress", "squarespace", "loja_integrada"):
            add("Stack", (12, f"feito em {stack}, da pra modernizar"))
        faltas = []
        if _sig(signals, "has_h1") is False:
            faltas.append("sem H1")
        if _sig(signals, "has_title") is False:
            faltas.append("sem title")
        if _sig(signals, "has_description") is False:
            faltas.append("sem meta description")
        if faltas:
            add("Estrutura", (8, "; ".join(faltas)))
        if _sig(signals, "https") is False:
            add("Seguranca", (8, "site sem HTTPS"))

    # negocio real que vale o investimento em design
    add("Reputacao", _rating_points(lead.rating))
    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# ICP marketing/social: presenca digital (redes + reputacao + site)
# Presenca fraca/abandonada = oportunidade. Frequencia/engajamento de posts
# NAO da pra medir de graca (IG/FB sao gated); usamos proxies de presenca.
# ---------------------------------------------------------------------
def score_marketing(lead: Lead, signals: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        crit.append({"label": label, "points": pts_note[0], "note": pts_note[1]})

    ig_status = signals.get("instagram_status")
    if not is_present("instagram", lead.instagram):
        add("Instagram", (22, "sem Instagram, presenca a construir"))
    elif ig_status == "parado":
        add("Instagram", (18, "tem Instagram mas parado, da pra assumir a gestao"))
    elif ig_status == "ativo":
        add("Instagram", (6, "Instagram ativo, bem cuidado"))
    else:
        add("Instagram", (6, "tem Instagram (da pra avaliar a gestao)"))
    if is_present("facebook", lead.facebook):
        add("Facebook", (3, "tem Facebook"))
    else:
        add("Facebook", (8, "sem Facebook"))
    if is_present("website", lead.website):
        add("Site", (4, "tem site"))
    else:
        add("Site", (10, "sem site, presenca incompleta"))

    # reputacao: pouca avaliacao = precisa movimentar a marca
    n = lead.reviews_count
    if n is None or n < 30:
        add("Reputacao", (14, "pouca avaliacao, marca pouco movimentada"))
    elif n < 150:
        add("Reputacao", (8, f"reputacao em construcao ({n} avaliacoes)"))
    else:
        add("Reputacao", (4, f"ja tem volume ({n} avaliacoes)"))

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


def _summary(lens: str, target: ServiceTarget, lead: Lead, signals: dict[str, Any]) -> str:
    nome = lead.business_name or "o negocio"
    sem_site = not is_present("website", lead.website)
    ads = signals.get("ads_active")
    nota, aval = lead.rating, lead.reviews_count

    movimento = ""
    if nota is not None and aval:
        movimento = f"nota {nota} com {aval} avaliacoes"
    elif aval:
        movimento = f"{aval} avaliacoes"

    if lens == "design":
        if sem_site:
            return (f"Bom pra design/web. {nome} nao tem site, da pra criar a presenca "
                    f"do zero. Tem movimento ({movimento or 'cliente na regiao'}) que justifica.")
        defeitos = []
        if _sig(signals, "mobile_ready") is False:
            defeitos.append("nao adaptado pra celular")
        ps = _sig(signals, "perf_score")
        if isinstance(ps, (int, float)) and ps < 50:
            defeitos.append(f"lento no celular (PageSpeed {ps}/100)")
        elif _sig(signals, "slow") is True:
            defeitos.append("pesado/lento")
        if _sig(signals, "stack") in ("wix", "wordpress", "squarespace", "loja_integrada"):
            defeitos.append(f"feito em {_sig(signals, 'stack')}")
        det = ", ".join(defeitos) or "da pra modernizar"
        return f"Bom pra design/web. {nome} tem site, mas {det}. Cabe um redesign."
    if lens == "marketing":
        falta = []
        if not is_present("instagram", lead.instagram):
            falta.append("sem Instagram")
        elif signals.get("instagram_status") == "parado":
            falta.append("Instagram parado")
        if not is_present("facebook", lead.facebook):
            falta.append("sem Facebook")
        det = ", ".join(falta) or "presenca a fortalecer"
        return (f"Bom pra marketing/social. {nome} tem {det}. "
                f"Da pra construir e movimentar a presenca da marca.")
    if lens == "trafego" or target == "trafego":
        extra = []
        if sem_site:
            extra.append("sem site")
        if ads is False:
            extra.append("nao anuncia")
        sinais = ", ".join([s for s in [movimento, *extra] if s])
        return (f"Trafego e o melhor alvo. {nome} tem {sinais}. "
                f"Da pra atrair cliente novo da regiao com anuncio local.").replace("  ", " ")
    if lens == "automacao" or target == "automacao":
        ramo = f", {lead.category}" if lead.category else ""
        base = movimento or "bastante cliente"
        return (f"Automacao e o melhor alvo. {nome} tem {base}{ramo} e atende no WhatsApp. "
                f"Da pra montar um atendimento que responde e agenda sozinho.")
    if target == "ambos":
        return (f"Cabe trafego e automacao. {nome} tem movimento pra anunciar "
                f"e volume pra automatizar o atendimento.")
    return "Fora do alvo por agora."


def score_lead(
    lead: Lead, signals: dict[str, Any] | None = None, profession: str | None = None
) -> ScoreResult:
    """Pontua o lead pela LENTE da profissao do dono (quem ele e define o que
    procura). trafego/automacao/ambos mantem os ICPs originais; design/web/
    branding olham qualidade do site; marketing olha presenca; sem profissao
    cai no legado (compara trafego x automacao)."""
    signals = signals or {}
    lens = lens_for(profession)

    t_score, t_crit = score_trafego(lead, signals)
    a_score, a_crit = score_automacao(lead, signals)
    d_score, d_crit = score_design(lead, signals)
    m_score, m_crit = score_marketing(lead, signals)

    # escolhe o score e o alvo conforme a lente da profissao
    if lens == "trafego":
        best, winning_crit, target = t_score, t_crit, "trafego"
    elif lens == "automacao":
        best, winning_crit, target = a_score, a_crit, "automacao"
    elif lens == "design":
        best, winning_crit, target = d_score, d_crit, "design"
    elif lens == "marketing":
        best, winning_crit, target = m_score, m_crit, "marketing"
    elif lens == "ambos":
        best = max(t_score, a_score)
        if t_score >= AMBOS_BAR and a_score >= AMBOS_BAR:
            target, winning_crit = "ambos", (t_crit if t_score >= a_score else a_crit)
        elif t_score >= a_score:
            target, winning_crit = "trafego", t_crit
        else:
            target, winning_crit = "automacao", a_crit
    else:  # auto (legado): compara trafego x automacao
        best = max(t_score, a_score)
        if t_score >= AMBOS_BAR and a_score >= AMBOS_BAR:
            target, winning_crit = "ambos", t_crit
        elif t_score >= a_score:
            target, winning_crit = "trafego", t_crit
        else:
            target, winning_crit = "automacao", a_crit

    contactable = is_present("phone", lead.phone)
    if not contactable:
        decision: Decision = "descartado"
        target = "indefinido"
        verdict = "sem telefone, nao da pra contatar no WhatsApp"
    elif best < THRESHOLD:
        decision = "descartado"
        target = "indefinido"
        verdict = "abaixo do corte do ICP"
    else:
        decision = "qualificado"
        verdict = "atingiu o corte do ICP"

    reason = {
        "total": best,
        "threshold": THRESHOLD,
        "decision": decision,
        "verdict": verdict,
        "lens": lens,
        "service_target": target,
        "summary": _summary(lens, target, lead, signals),
        "criteria": winning_crit,
        "trafego": {"score": t_score, "criteria": t_crit},
        "automacao": {"score": a_score, "criteria": a_crit},
        "design": {"score": d_score, "criteria": d_crit},
        "marketing": {"score": m_score, "criteria": m_crit},
    }
    return ScoreResult(score=best, decision=decision, service_target=target, reason=reason)
