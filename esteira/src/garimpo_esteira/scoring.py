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
from datetime import date
from typing import Any, Literal

from .models import Lead, ServiceTarget
from .validation import is_present

THRESHOLD = 50    # >= qualificado; abaixo, descartado
AMBOS_BAR = 70    # os dois servicos fortes => alvo "ambos"

# O corte de 50 foi calibrado pras lentes que somam nota + avaliacoes do Maps:
# so esses dois criterios ja valem ate 50, e todo lead do Maps tem os dois. A
# lente de advocacia nao usa nenhum dos dois — ela le EMPRESA (natureza, socios,
# capital, regime, situacao, idade), e nada disso existe sem o CNPJ resolvido.
# Resultado: leads bons empacavam em 45-49 e caiam no descarte, correndo uma
# prova diferente com a mesma regua.
#
# O corte e baixo de proposito: pro advogado B2B, empresa identificada com um
# canal de contato JA e alguem a quem se apresentar. O score aqui serve pra
# ORDENAR a fila (quem tem socios, capital, situacao irregular ou site sem
# politica sobe), nao pra barrar. Barrar so o que nao da pra abordar ou nao da
# pra reconhecer como empresa.
_THRESHOLD_BY_LENS = {"advocacia": 20}


def threshold_for(lens: str) -> int:
    return _THRESHOLD_BY_LENS.get(lens, THRESHOLD)

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


# O1 "negocio novo": negocio aberto ha pouco quase sempre precisa montar
# presenca (site/redes/trafego). A data vem da BrasilAPI (data_inicio_atividade).
# Pesa nas lentes trafego/design/marketing; nao na automacao (essa quer volume
# de operacao, que negocio novo ainda nao tem).
def _parse_opened_on(value: str | None) -> date | None:
    if not value:
        return None
    try:
        y, m, d = value.strip()[:10].split("-")
        return date(int(y), int(m), int(d))
    except (ValueError, TypeError):
        return None


def _months_since(start: date, today: date) -> int:
    months = (today.year - start.year) * 12 + (today.month - start.month)
    if today.day < start.day:
        months -= 1
    return max(months, 0)


def _idade_label(months: int) -> str:
    if months <= 0:
        return "aberto este mes"
    if months == 1:
        return "aberto ha 1 mes"
    if months < 24:
        return f"aberto ha {months} meses"
    anos = months // 12
    return f"aberto ha {anos} ano" + ("s" if anos > 1 else "")


def _engagement_points(followers: Any, engagement: Any) -> tuple[int, str] | None:
    """Pontos pelo engajamento do IG (lens marketing). None quando faltam dados.
    Taxa = interacoes medias / seguidores: <1% audiencia parada (oportunidade),
    1-3% mediana, >3% saudavel (bem gerido)."""
    try:
        f = float(followers)
        e = float(engagement)
    except (TypeError, ValueError):
        return None
    if f <= 0 or e < 0:
        return None
    rate = e / f
    pct = round(rate * 100, 1)
    if rate < 0.01:
        return 12, f"engajamento fraco ({pct}%), audiencia parada, da pra movimentar"
    if rate < 0.03:
        return 6, f"engajamento mediano ({pct}%)"
    return 2, f"engajamento saudavel ({pct}%), marca bem cuidada"


def _company_age_points(opened_on: str | None, today: date | None = None) -> tuple[int, str] | None:
    """Pontos pela idade do negocio. None quando nao se sabe a data (sem item no
    breakdown). Com data: <6 meses forte, 6-18 leve, mais que isso neutro (0,
    mas aparece no breakdown pra ficar transparente)."""
    d = _parse_opened_on(opened_on)
    if d is None:
        return None
    months = _months_since(d, today or date.today())
    quando = _idade_label(months)
    if months < 6:
        return 18, f"negocio novo ({quando}), precisa montar presenca"
    if months <= 18:
        return 8, f"negocio recente ({quando})"
    return 0, f"negocio estabelecido ({quando})"


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
    "advocacia": "advocacia",
}


def lens_for(profession: str | None) -> str:
    return _LENS.get((profession or "").strip().lower(), "auto")


# ---------------------------------------------------------------------
# ICP trafego: visibilidade pra quem ja tem cliente
# ---------------------------------------------------------------------
def score_trafego(
    lead: Lead, signals: dict[str, Any], today: date | None = None
) -> tuple[int, list[dict[str, Any]]]:
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
    ads_count = signals.get("ads_count")
    if ads is True or pixel:
        # intensidade (Fase 6): quem anuncia MUITO ja domina aquisicao -> a venda
        # vira otimizacao (menos pontos de "captar cliente novo"); quem anuncia
        # pouco ainda tem espaco. Pixel sem contagem cai no caso leve.
        if isinstance(ads_count, int) and ads_count >= 5:
            add("Anuncia?", (4, f"ja anuncia forte ({ads_count} anuncios ativos), foco em otimizacao"))
        else:
            add("Anuncia?", (6, "ja anuncia (aquecido), da pra otimizar"))
    elif ads is False:
        add("Anuncia?", (15, "nao anuncia, oportunidade de trafego"))
    else:
        add("Anuncia?", (8, "anuncio desconhecido"))

    idade = _company_age_points(lead.opened_on, today)
    if idade is not None:
        add("Idade", idade)

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
def score_design(
    lead: Lead, signals: dict[str, Any], today: date | None = None
) -> tuple[int, list[dict[str, Any]]]:
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
    idade = _company_age_points(lead.opened_on, today)
    if idade is not None:
        add("Idade", idade)
    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# ICP marketing/social: presenca digital (redes + Perfil de Empresa no Google).
# ICP em U (dois extremos, escolhido pelo dono): SEM presenca = oportunidade de
# CONSTRUIR; presenca FORTE = cliente com verba que valoriza mkt (ESCALAR). O
# meio-termo morno (posta as vezes, sem ritmo) pontua baixo, fica abaixo do corte.
# Site NAO entra aqui (isso e design/dev); a preocupacao e redes + Google.
# ---------------------------------------------------------------------
def _kfmt(n: int) -> str:
    return f"{round(n / 1000)}k" if n >= 1000 else str(n)


def _marketing_presence(
    lead: Lead, signals: dict[str, Any]
) -> tuple[int, str, str]:
    """(pontos, nota, faixa) do eixo de presenca no Instagram. faixa in
    {construir, escalar, morno} — a espinha do U e o gancho da copy. Sem IG e IG
    parado pontuam alto (construir); ativo+recorrente pontua alto (escalar);
    ativo sem ritmo pontua baixo (morno)."""
    if not is_present("instagram", lead.instagram):
        return 30, "sem Instagram, presenca a construir do zero", "construir"
    status = signals.get("instagram_status")
    freq = signals.get("instagram_post_freq")
    try:
        pf = float(freq) if freq is not None else None
    except (TypeError, ValueError):
        pf = None
    recurrent = pf is not None and pf >= 1.0  # >=1 post/semana = ritmo
    if status == "parado":
        return 26, "Instagram parado, da pra assumir a gestao", "construir"
    if status == "ativo" and recurrent:
        return 26, "Instagram ativo e postando com recorrencia, angulo de escalar/otimizar", "escalar"
    if status == "ativo":
        return 12, "Instagram ativo mas sem ritmo constante, da pra profissionalizar", "morno"
    # sem token / status desconhecido: nao chuta, mas usa a recorrencia se houver
    if recurrent:
        return 24, "Instagram com posts recorrentes, presenca a elevar", "escalar"
    return 14, "tem Instagram (da pra avaliar a gestao)", "morno"


def _followers_points(followers: Any) -> tuple[int, str] | None:
    """Valor de audiencia (nao oportunidade): base grande = mais pra gerir, bom
    pro cliente de escala; base pequena = presenca a crescer. None sem dado."""
    try:
        f = int(followers)
    except (TypeError, ValueError):
        return None
    if f < 0:
        return None
    if f >= 10000:
        return 10, f"base grande ({_kfmt(f)} seguidores), audiencia valiosa pra gerir"
    if f >= 3000:
        return 8, f"base media ({_kfmt(f)} seguidores)"
    if f >= 500:
        return 6, f"base pequena ({f} seguidores), da pra crescer"
    return 5, f"poucos seguidores ({f}), presenca a construir"


def _gmb_presence_points(lead: Lead) -> tuple[int, str]:
    """Perfil de Empresa no Google (GMB) — composto do que ja temos. Sem perfil =
    presenca incompleta (oportunidade); perfil rico = marca bem posicionada."""
    on_google = bool(lead.maps_place_id) or lead.rating is not None or bool(lead.reviews_count)
    if not on_google:
        return 12, "sem Perfil de Empresa no Google, presenca incompleta"
    complete = (
        bool(lead.opening_hours)
        and is_present("website", lead.website)
        and (lead.reviews_count or 0) >= 20
    )
    if complete:
        return 3, "Perfil de Empresa no Google bem preenchido"
    return 7, "Perfil de Empresa no Google incompleto (falta site/horario/avaliacoes)"


def marketing_angle(lead: Lead, signals: dict[str, Any] | None = None) -> str:
    """Faixa do ICP de marketing (construir/escalar/morno) — reusada pela copy
    pra escolher o angulo (construir presenca x escalar/otimizar)."""
    return _marketing_presence(lead, signals or {})[2]


def score_marketing(
    lead: Lead, signals: dict[str, Any], today: date | None = None
) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []

    def add(label: str, pts_note: tuple[int, str]) -> None:
        crit.append({"label": label, "points": pts_note[0], "note": pts_note[1]})

    pts, note, _faixa = _marketing_presence(lead, signals)
    add("Presenca", (pts, note))
    fol = _followers_points(signals.get("instagram_followers"))
    if fol is not None:
        add("Alcance", fol)
    # engajamento real do IG: taxa = interacoes medias / seguidores. Baixa =
    # audiencia parada, da pra movimentar; saudavel = bem gerido (menos pontos).
    eng = _engagement_points(signals.get("instagram_followers"), signals.get("instagram_engagement"))
    if eng is not None:
        add("Engajamento", eng)
    add("Google", _gmb_presence_points(lead))
    if is_present("facebook", lead.facebook):
        add("Facebook", (3, "tem Facebook"))
    else:
        add("Facebook", (7, "sem Facebook"))

    # reputacao: pouca avaliacao = marca pouco movimentada
    n = lead.reviews_count
    if n is None or n < 30:
        add("Reputacao", (12, "pouca avaliacao, marca pouco movimentada"))
    elif n < 150:
        add("Reputacao", (7, f"reputacao em construcao ({n} avaliacoes)"))
    else:
        add("Reputacao", (4, f"ja tem volume ({n} avaliacoes)"))

    idade = _company_age_points(lead.opened_on, today)
    if idade is not None:
        add("Idade", idade)
    add("Contato", _contact_points(lead))
    return sum(c["points"] for c in crit), crit


# ---------------------------------------------------------------------
# ICP advocacia: o INVERSO do de marketing. Nao olha Instagram, engajamento,
# GMB nem "ja anuncia" — nada disso e leitura juridica. Olha EMPRESA: natureza
# juridica, socios, capital, regime, situacao na Receita, idade e assessoria
# aparente. MEI corta antes de tudo: e pessoa com CNPJ, nao contrata advogado.
# ---------------------------------------------------------------------
_MEI_MARKERS = ("MEI", "MICROEMPREENDEDOR INDIVIDUAL")

# Ramo -> dor juridica dominante. Alimenta o criterio "Risco do ramo".
_RISCO_JURIDICO: tuple[tuple[tuple[str, ...], int, str], ...] = (
    (("clinic", "clínic", "odonto", "medic", "médic", "laborator", "fisio", "psicolog"),
     14, "saude: consumo, conselho profissional e dado sensivel (LGPD)"),
    (("restaurante", "pizzaria", "lanchonete", "hamburg", "padaria", "buffet",
      "hotel", "pousada", "construc", "construç", "constru", "transport",
      "logistic", "limpeza", "seguranca", "segurança"),
     16, "ramo de rotatividade alta, exposicao trabalhista tipica"),
    (("oficina", "mecanic", "mecânic", "loja", "varejo", "otica", "ótica",
      "farmacia", "farmácia", "movei", "móvei", "eletro", "academia", "escola",
      "curso", "petshop", "pet shop", "estetic", "estétic"),
     12, "ramo de relacao de consumo intensa (CDC)"),
    (("imobiliar", "imobiliár", "incorporad", "corretor", "contabil", "contábil",
      "distribuid", "atacad", "industri", "indústri"),
     12, "ramo contratual/regulatorio, demanda consultiva recorrente"),
)

# Sub-pesos por area juridica marcada pelo dono: multiplica o criterio que mais
# importa naquela area. Sem area marcada, todos valem 1.0 (leitura neutra).
_AREA_WEIGHTS: dict[str, dict[str, float]] = {
    "trabalhista": {"Risco do ramo": 1.6, "Idade": 1.3},
    "tributario": {"Capital": 1.6, "Regime": 1.8},
    "societario": {"Socios": 1.8, "Natureza": 1.4},
    "consumidor": {"Atrito": 1.8, "Risco do ramo": 1.3},
    "lgpd": {"Assessoria": 1.8},
    # Consultivo/contratual: quem tem contrato pra revisar e uma operacao que
    # gera obrigacao. Natureza (sociedade tem contrato social) e idade (nova
    # constitui, madura acumula) pesam; o resto fica neutro.
    "consultivo": {"Natureza": 1.5, "Idade": 1.4, "Risco do ramo": 1.2},
}


def is_mei(lead: Lead) -> bool:
    """MEI pela natureza juridica ou pelo porte da Receita. Corte duro do ICP:
    MEI e uma pessoa com CNPJ, nao um cliente de assessoria juridica."""
    nat = (getattr(lead, "natureza_juridica", None) or "").upper()
    porte = (lead.porte or "").upper()
    return any(m in nat for m in _MEI_MARKERS) or porte == "MEI"


def _natureza_points(lead: Lead) -> tuple[int, str] | None:
    """None quando nao se sabe. Dado desconhecido nao pode virar ponto: antes
    'natureza juridica desconhecida' valia 8, entao um lead sem nenhuma consulta
    a Receita ja largava com pontos que nao representavam nada."""
    nat = (getattr(lead, "natureza_juridica", None) or "").upper()
    if not nat:
        return None
    if "LIMITADA" in nat or "ANONIMA" in nat or "ANÔNIMA" in nat or "S/A" in nat:
        return 22, "sociedade (contrato social, governanca, demanda societaria)"
    if "INDIVIDUAL" in nat or "EIRELI" in nat:
        return 12, "empresario individual, demanda mais enxuta"
    return 10, f"natureza juridica: {nat.lower()}"


def _socios_points(lead: Lead) -> tuple[int, str] | None:
    """Ao contrario das outras lentes, socio aqui e DEMANDA (acordo, saida,
    sucessao, conflito), nao obstaculo de venda."""
    # o cascade grava o valor cru da fonte (string) na coluna; coage aqui.
    try:
        n = int(lead.socios_count)
    except (TypeError, ValueError):
        return None
    if n >= 3:
        return 16, f"{n} socios (acordo de socios, sucessao, conflito)"
    if n == 2:
        return 12, "2 socios (acordo de socios, saida, sucessao)"
    return 4, "socio unico"


def _capital_points(lead: Lead) -> tuple[int, str] | None:
    try:
        c = float(lead.capital_social)
    except (TypeError, ValueError):
        return None
    if c >= 500000:
        return 16, "capital alto, empresa estruturada"
    if c >= 100000:
        return 12, "capital medio"
    if c >= 10000:
        return 7, "capital pequeno"
    return 3, "capital baixo"


def _regime_points(signals: dict[str, Any]) -> tuple[int, str] | None:
    simples = _sig(signals, "simples")
    if simples is None:
        return None
    if simples is False:
        return 14, "fora do Simples (demanda tributaria de verdade)"
    return 5, "optante pelo Simples"


def _situacao_juridica_points(lead: Lead) -> tuple[int, str] | None:
    """Empresa irregular NAO e lead morto aqui: e empresa com demanda de
    regularizacao em curso. O oposto do que vale pras outras lentes.

    None quando nao se sabe — um item de 0 ponto rotulado 'desconhecida' so
    poluia o breakdown na ficha sem dizer nada."""
    status = (lead.company_status or "").strip().upper()
    if not status:
        return None
    if status == "ATIVA":
        return 6, "empresa ativa na Receita"
    return 18, f"empresa {status.lower()} na Receita, demanda de regularizacao"


def _idade_juridica_points(
    opened_on: str | None, today: date | None = None
) -> tuple[int, str] | None:
    """U: recem-aberta (constituicao, contratos, marca, LGPD) e madura com tempo
    de casa (passivo e sucessao acumulam). O meio pontua baixo."""
    d = _parse_opened_on(opened_on)
    if d is None:
        return None
    months = _months_since(d, today or date.today())
    quando = _idade_label(months)
    if months <= 18:
        return 16, f"empresa nova ({quando}), fase de constituicao e contratos"
    if months >= 60:
        return 14, f"empresa madura ({quando}), passivo e sucessao acumulam"
    return 4, f"empresa em consolidacao ({quando})"


def _assessoria_points(lead: Lead, signals: dict[str, Any]) -> tuple[int, str] | None:
    """Ausencia de politica de privacidade / termos = provavelmente ninguem
    revisou. So opina quando o site existe E foi lido.

    E BONUS, nunca requisito. O advogado quer se apresentar a empresas; se a
    empresa tem site ou nao, e se conseguimos ler o HTML dela, nao diz nada
    sobre ela precisar de advogado. Este criterio pesava tanto que empresa sem
    site caia no descarte por tabela — leitura de marketing infiltrada na lente
    juridica. Agora ele so ORDENA: quem tem site sem politica sobe na fila,
    quem nao tem site nao perde nada por isso."""
    if not is_present("website", lead.website):
        return None
    priv = _sig(signals, "has_privacy_policy")
    terms = _sig(signals, "has_terms")
    if priv is None and terms is None:
        return None
    faltas = []
    if priv is False:
        faltas.append("sem politica de privacidade")
    if terms is False:
        faltas.append("sem termos de uso")
    if not faltas:
        # Ter politica e termos NAO prova que passou por advogado: gerador
        # online e IA produzem os dois em minutos, e o texto generico costuma
        # nao cobrir o negocio de verdade. Entao pesa pouco menos que a
        # ausencia, nao muito menos — a diferenca e de 5 pontos, nao de 20.
        return 9, "site com politica e termos (pode ser modelo generico)"
    nota = ", ".join(faltas)
    if _sig(signals, "has_ecommerce") is True:
        return 18, f"vende online e {nota} (exposicao de consumo e LGPD)"
    return 14, f"site {nota}, ninguem revisou"


def _risco_ramo_points(lead: Lead, signals: dict[str, Any]) -> tuple[int, str] | None:
    alvo = " ".join([
        (lead.category or ""),
        (lead.business_name or ""),
        " ".join(_sig(signals, "cnaes_sec") or []),
    ]).lower()
    if not alvo.strip():
        return None
    for keys, pts, nota in _RISCO_JURIDICO:
        if any(k in alvo for k in keys):
            return pts, nota
    return None


def _atrito_consumidor_points(lead: Lead) -> tuple[int, str] | None:
    """Nota baixa COM volume = atrito real com cliente. Sinal INTERNO: prioriza
    na ficha, NUNCA entra na copy (a muralha, ver o spec da area)."""
    n = lead.reviews_count or 0
    if lead.rating is None or n < 30:
        return None
    if lead.rating < 3.5:
        return 14, f"reputacao em atrito (nota {lead.rating} em {n} avaliacoes)"
    if lead.rating < 4.0:
        return 8, f"reputacao mediana (nota {lead.rating} em {n} avaliacoes)"
    return None


def _contato_juridico_points(lead: Lead) -> tuple[int, str]:
    """A advocacia tem dois canais: WhatsApp e o e-mail formal (endereco vindo
    da Receita). Telefone continua valendo mais — resposta e mais rapida — mas
    so e-mail ja da pra abordar, e e o registro que cabe melhor na profissao."""
    tem_fone = is_present("phone", lead.phone)
    tem_email = is_present("email", lead.email)
    if tem_fone:
        return 7, "tem telefone (WhatsApp)"
    if tem_email:
        # So o e-mail custa 2 pontos, nao o criterio inteiro: da pra abordar,
        # e o e-mail formal e ate mais adequado a profissao que o WhatsApp frio.
        # Ficar sem nenhum dos dois e que zera.
        return 5, "sem telefone, mas tem e-mail (aborda pelo e-mail formal)"
    return 0, "sem telefone e sem e-mail"


def score_advocacia(
    lead: Lead, signals: dict[str, Any], today: date | None = None,
    legal_areas: list[str] | None = None,
) -> tuple[int, list[dict[str, Any]]]:
    crit: list[dict[str, Any]] = []
    weights: dict[str, float] = {}
    for a in (legal_areas or []):
        for label, mult in _AREA_WEIGHTS.get((a or "").strip().lower(), {}).items():
            weights[label] = max(weights.get(label, 1.0), mult)

    def add(label: str, pts_note: tuple[int, str] | None) -> None:
        if pts_note is None:
            return
        pts = int(round(pts_note[0] * weights.get(label, 1.0)))
        crit.append({"label": label, "points": pts, "note": pts_note[1]})

    if is_mei(lead):
        return 0, [{"label": "Porte", "points": 0,
                    "note": "MEI: pessoa com CNPJ, nao contrata advogado"}]

    add("Natureza", _natureza_points(lead))
    add("Socios", _socios_points(lead))
    add("Capital", _capital_points(lead))
    add("Regime", _regime_points(signals))
    add("Situacao", _situacao_juridica_points(lead))
    add("Idade", _idade_juridica_points(lead.opened_on, today))
    add("Assessoria", _assessoria_points(lead, signals))
    add("Risco do ramo", _risco_ramo_points(lead, signals))
    add("Atrito", _atrito_consumidor_points(lead))
    add("Contato", _contato_juridico_points(lead))
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
    # Descarte por FATO, nao por nota: empresa nao-ATIVA na Receita, ou sem
    # nenhum canal de contato. Nao adianta insistir num negocio morto nem
    # escrever copy pra quem nao tem telefone e nem e-mail. Quem quer poupar um
    # lead do corte (o cadastrado a mao, por exemplo) so pode poupar do corte
    # por NOTA, que e julgamento; esses dois sao fato.
    hard_discard: bool = False
    # O alvo que o lead casou ANTES do descarte zerar pra "indefinido". Serve pra
    # quem reverte um descarte por nota nao ficar com um lead "qualificado" sem
    # servico nenhum, incoerente na ficha e mudo no rascunho.
    matched_target: ServiceTarget = "indefinido"


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
        faixa = marketing_angle(lead, signals)
        gmb_incompleto = not (bool(lead.maps_place_id) or lead.rating is not None)
        if faixa == "escalar":
            base = movimento or "audiencia ja formada"
            return (f"Bom pra marketing/social. {nome} ja tem presenca ativa ({base}). "
                    f"O angulo e escalar e otimizar o que ja roda (conteudo, ritmo, alcance).")
        falta = []
        if not is_present("instagram", lead.instagram):
            falta.append("sem Instagram")
        elif signals.get("instagram_status") == "parado":
            falta.append("Instagram parado")
        if not is_present("facebook", lead.facebook):
            falta.append("sem Facebook")
        if gmb_incompleto:
            falta.append("fraco no Google")
        det = ", ".join(falta) or "presenca a fortalecer"
        return (f"Bom pra marketing/social. {nome} tem {det}. "
                f"Da pra construir e movimentar a presenca da marca.")
    if lens == "advocacia":
        # MEI e corte duro da lente (score 0). Sem esta saida o resumo dizia
        # "Bom pra advocacia. (...) Perfil de empresa que sustenta assessoria
        # juridica" logo abaixo de um lead descartado — a tela se contradizia.
        if is_mei(lead):
            return (f"{nome} e MEI: pessoa com CNPJ, nao empresa com quadro "
                    f"societario. Nao sustenta assessoria juridica.")
        partes = []
        nat = (getattr(lead, "natureza_juridica", None) or "")
        if nat:
            partes.append(nat.split(" - ")[-1].lower())
        if lead.socios_count:
            partes.append(f"{lead.socios_count} socios")
        idade = _idade_juridica_points(lead.opened_on)
        if idade is not None:
            partes.append(idade[1].split(" (")[0])
        situacao = (lead.company_status or "").strip().upper()
        if situacao and situacao != "ATIVA":
            partes.append(f"situacao {situacao.lower()} na Receita")
        det = ", ".join(partes) or "empresa formalizada"
        return (f"Bom pra advocacia. {nome}: {det}. "
                f"Perfil de empresa que sustenta assessoria juridica.")
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


def _offered_lenses(professions: list[str]) -> set[str]:
    """Profissoes do dono -> conjunto de lentes de servico que ele oferta.
    'ambos' abre em trafego+automacao. Vazio (sem profissao) cai no default
    trafego+automacao: a maioria dos leads serve pros dois (a API do FB ainda
    nao liga, entao 'nao sei se anuncia' = candidato aos dois)."""
    lenses: set[str] = set()
    for p in professions:
        lens = _LENS.get((p or "").strip().lower())
        if lens == "ambos":
            lenses.update({"trafego", "automacao"})
        elif lens in ("trafego", "automacao", "design", "marketing", "advocacia"):
            lenses.add(lens)
    return lenses or {"trafego", "automacao"}


def score_lead(
    lead: Lead, signals: dict[str, Any] | None = None, profession: str | None = None,
    *, professions: list[str] | None = None, today: date | None = None,
    legal_areas: list[str] | None = None,
) -> ScoreResult:
    """Pontua o lead pelas LENTES dos servicos que o dono oferta (pode ser mais
    de um). Qualifica pelo MELHOR encaixe entre as lentes ofertadas.

    Alvo de servico (#2): quando a oferta cobre trafego E automacao, a maioria
    dos leads e "ambos" (precisam atrair E operar); so vira "automacao" quando o
    negocio JA anuncia (ja faz trafego, a lacuna passa a ser atendimento). ads
    desconhecido (None) = ambos. Se a oferta cobre so um eixo, mantem esse eixo;
    design/marketing/advocacia entram quando pontuam mais que o eixo.

    legal_areas so tem efeito na lente de advocacia (pesa os criterios da area
    de atuacao escolhida); nas demais e ignorado."""
    signals = signals or {}
    profs = professions if professions is not None else ([profession] if profession else [])
    lenses = _offered_lenses(profs)

    t_score, t_crit = score_trafego(lead, signals, today)
    a_score, a_crit = score_automacao(lead, signals)
    d_score, d_crit = score_design(lead, signals, today)
    m_score, m_crit = score_marketing(lead, signals, today)
    adv_score, adv_crit = score_advocacia(lead, signals, today, legal_areas)
    by_lens = {
        "trafego": (t_score, t_crit), "automacao": (a_score, a_crit),
        "design": (d_score, d_crit), "marketing": (m_score, m_crit),
        "advocacia": (adv_score, adv_crit),
    }

    # qualifica pelo melhor encaixe entre as lentes ofertadas
    candidates = {k: by_lens[k][0] for k in lenses}
    best_lens = max(candidates, key=lambda k: candidates[k])
    best = candidates[best_lens]
    winning_crit = by_lens[best_lens][1]

    offers_traf = "trafego" in lenses
    offers_auto = "automacao" in lenses
    ads = signals.get("ads_active")

    if offers_traf and offers_auto:
        # eixo trafego+automacao presente: regra #2. So abre pra design/marketing
        # se um deles pontuar acima do eixo.
        non_axis = {k: candidates[k] for k in candidates
                    if k in ("design", "marketing", "advocacia")}
        axis_best = max(t_score, a_score)
        if non_axis and max(non_axis.values()) > axis_best:
            target = max(non_axis, key=lambda k: non_axis[k])
        else:
            target = "automacao" if ads is True else "ambos"
    else:
        target = best_lens

    # corte duro: empresa nao-ATIVA na Receita (baixada/inapta/suspensa/nula) =
    # negocio morto, nao vale prospectar. Vence ate score alto. So corta quando se
    # SABE a situacao (status vazio = desconhecido, segue o fluxo normal).
    # EXCECAO (area de advocacia): empresa irregular e negocio morto pra quem
    # vende marketing, e e CLIENTE pra quem vende advogado — regularizacao em
    # curso. O corte so vale quando a lente vencedora NAO e a de advocacia.
    status = (lead.company_status or "").strip().upper()
    inactive = bool(status) and status != "ATIVA" and best_lens != "advocacia"
    # Contato: as outras areas so abordam por WhatsApp, entao sem telefone o lead
    # e inalcancavel. A advocacia tem um SEGUNDO canal desenhado — o e-mail
    # formal, com endereco que ja vem da Receita — e o registro institucional
    # cabe melhor na profissao que o WhatsApp frio. Ali o e-mail tambem serve.
    contactable = is_present("phone", lead.phone) or (
        best_lens == "advocacia" and is_present("email", lead.email)
    )
    # O alvo casado antes de qualquer corte. Guardado porque o descarte zera o
    # target, e quem reverte um descarte por nota precisa dele de volta.
    matched_target: ServiceTarget = target
    hard_discard = False
    if inactive:
        decision: Decision = "descartado"
        target = "indefinido"
        hard_discard = True
        verdict = f"empresa {status.lower()} na Receita, nao vale prospectar"
        winning_crit = [*winning_crit, {"label": "Situacao", "points": 0, "note": verdict}]
    elif not contactable:
        decision = "descartado"
        target = "indefinido"
        hard_discard = True
        verdict = (
            "sem telefone e sem e-mail, nao da pra contatar"
            if best_lens == "advocacia"
            else "sem telefone, nao da pra contatar no WhatsApp"
        )
    elif best < threshold_for(best_lens):
        decision = "descartado"
        target = "indefinido"
        verdict = "abaixo do corte do ICP"
    else:
        decision = "qualificado"
        verdict = "atingiu o corte do ICP"

    # lente do resumo: design/marketing usam a propria; trafego/automacao/ambos
    # seguem o alvo (pra _summary escolher o texto certo).
    lens_label = best_lens if best_lens in ("design", "marketing", "advocacia") else target
    reason = {
        "total": best,
        "threshold": threshold_for(best_lens),
        "decision": decision,
        "verdict": verdict,
        "lens": lens_label,
        "service_target": target,
        "summary": _summary(lens_label, target, lead, signals),
        "criteria": winning_crit,
        "trafego": {"score": t_score, "criteria": t_crit},
        "automacao": {"score": a_score, "criteria": a_crit},
        "design": {"score": d_score, "criteria": d_crit},
        "marketing": {"score": m_score, "criteria": m_crit},
        "advocacia": {"score": adv_score, "criteria": adv_crit},
    }
    return ScoreResult(
        score=best, decision=decision, service_target=target, reason=reason,
        hard_discard=hard_discard, matched_target=matched_target,
    )
