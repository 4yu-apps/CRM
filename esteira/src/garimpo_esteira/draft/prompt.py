"""Monta o contexto do lead para o rascunho (compartilhado por mock e Gemini).

Fluxo de 2 mensagens: (1) roteamento/abertura, (2) pitch. Personalizado pelos
sinais do ICP (nota, volume, descuido digital). Tom B2B, direto, pt-BR.
"""
from __future__ import annotations

from ..models import Lead
from ..validation import is_present


def lead_brief(lead: Lead) -> dict[str, object]:
    return {
        "nome": lead.business_name or "o negocio",
        "segmento": lead.category or "",
        "cidade": lead.city or "",
        "nota": lead.rating,
        "avaliacoes": lead.reviews_count,
        "tem_site": is_present("website", lead.website),
        "tem_instagram": is_present("instagram", lead.instagram),
    }


SYSTEM_INSTRUCTION = (
    "Voce escreve a primeira mensagem no WhatsApp com tom de quem fala com um "
    "conhecido: caloroso, gentil, simples, sem cara de vendedor nem de template. "
    "Portugues do Brasil com acentuacao correta. NUNCA invente dados.\n\n"
    "Estrutura das 2 mensagens:\n"
    "- msg1: cumprimento leve ('Oi, tudo bem?'), diz que encontrou o negocio na "
    "regiao e gostou do trabalho deles, confirma o que eles fazem ('vi que voces "
    "trabalham com X, certo?') e termina com UMA pergunta leve ligada ao servico.\n"
    "- msg2: o valor em uma frase simples + um convite leve e aberto ('podemos "
    "trocar uma ideia?', 'posso te mandar um exemplo?'). Nao marque reuniao de cara.\n\n"
    "Exemplo de TOM (adapte ao negocio, nao copie):\n"
    "msg1: 'Oi, tudo bem? Encontrei a Clinica Bella aqui na regiao e gostei muito "
    "do trabalho de voces. Vi que trabalham com estetica, certo? Voces ja fazem "
    "anuncio pra atrair cliente ou hoje e mais no boca a boca?'\n"
    "msg2: 'Eu ajudo negocio local a aparecer pra quem ja esta procurando perto. "
    "Podemos trocar uma ideia rapida? posso te mandar um exemplo.'\n\n"
    "Regras: cada mensagem curta (perto de 40 palavras). NUNCA cite numero de "
    "avaliacoes nem nota (soa raspado). NAO se apresente com cargo ('sou "
    "especialista', 'sou gestor'). PROIBIDO travessao: use virgula, parenteses ou "
    "ponto. Sem buzzword, sem emoji, sem regra de tres, sem 'nao e so X, e Y'."
)

# Foco da copy por servico/profissao — orienta o gancho e o pitch.
_SERVICE_BRIEF = {
    "trafego": (
        "Servico: TRAFEGO (anuncio local). Gancho em movimento e visibilidade. "
        "Valor: aparecer pra quem busca perto sem depender da sorte do Instagram."
    ),
    "automacao": (
        "Servico: AUTOMACAO (chatbot/atendimento no WhatsApp). Gancho em volume e "
        "operacao (muito cliente, atende e agenda na mao). Valor: atendimento que "
        "responde e agenda sozinho, sem perder cliente quando esta cheio."
    ),
    "ambos": (
        "Servico: TRAFEGO + AUTOMACAO. Lidera com trafego e cita a automacao de "
        "leve no fim como upsell ('e ainda da pra automatizar o atendimento depois')."
    ),
    "design": (
        "Servico: DESIGN / SITE. Gancho na presenca digital (site fraco, antigo, "
        "nao adaptado pra celular, ou ausente). Valor: um site/visual bonito e "
        "rapido que passa confianca e converte quem encontra o negocio."
    ),
    "marketing": (
        "Servico: MARKETING / SOCIAL. Gancho na presenca da marca nas redes "
        "(rede fraca, parada ou ausente). Valor: presenca constante e cuidada que "
        "mantem o negocio na cabeca do cliente. NAO prometa numero de seguidores."
    ),
    "indefinido": (
        "Servico: a definir; lidere com trafego (anuncio local) como padrao."
    ),
}

# profissao do dono -> qual brief de copy usar.
_PROF_TO_BRIEF = {
    "trafego": "trafego", "automacao": "automacao", "ambos": "ambos",
    "design": "design", "web": "design", "branding": "design",
    "marketing": "marketing",
}


def _brief_key(lead: Lead) -> str:
    prof = (getattr(lead, "profession", None) or "").strip().lower()
    if prof in _PROF_TO_BRIEF:
        return _PROF_TO_BRIEF[prof]
    # sem profissao: cai no servico-alvo do score (trafego/automacao/ambos)
    return getattr(lead, "service_target", "indefinido") or "indefinido"


def build_prompt(lead: Lead) -> str:
    b = lead_brief(lead)
    key = _brief_key(lead)
    sig = getattr(lead, "site_signals", None) or {}
    # contexto pra VOCE, modelo. NAO repita numeros na mensagem (ver regra critica).
    sinais = []
    if b["nota"] is not None and b["nota"] >= 4.3:
        sinais.append("boa reputacao no Google (bem avaliado)")
    elif b["nota"] is not None:
        sinais.append("reputacao mediana")
    if not b["tem_site"]:
        sinais.append("nao tem site (oportunidade de criar a presenca)")
    elif sig.get("mobile_ready") is False:
        sinais.append("tem site, mas nao e adaptado pra celular")
    elif sig.get("stack") in ("wix", "wordpress", "squarespace"):
        sinais.append(f"site feito em {sig.get('stack')} (da pra modernizar)")
    if not b["tem_instagram"]:
        sinais.append("sem presenca no Instagram")
    if sig.get("has_chat_widget") is False and key == "automacao":
        sinais.append("atende sem chatbot no site (tudo na mao)")

    # angulo condicional 1: ja investe em anuncio mas nao tem site pra reter o cliente
    if getattr(lead, "ads_active", None) is True and not b["tem_site"]:
        sinais.append(
            "ja investe em anuncio mas nao tem site pra reter "
            "(paga pra trazer cliente e deixa escapar)"
        )

    # angulo condicional 2: base fiel grande que nao consegue rechamar quem ja foi
    nota = b["nota"]
    aval = b["avaliacoes"]
    if (nota is not None and nota >= 4.5
            and aval is not None and aval >= 150
            and (not b["tem_site"] or not b["tem_instagram"])):
        sinais.append(
            "base fiel grande (bem avaliado e movimentado) que nao consegue "
            "rechamar o cliente que ja foi la"
        )

    # ancora de elogios reais (review_themes.elogio, quando disponivel)
    themes = getattr(lead, "review_themes", None) or {}
    if themes.get("elogio"):
        sinais.append(f"os clientes elogiam {themes['elogio']}")

    sinais_txt = "; ".join(sinais) or "poucos sinais publicos"

    # linha de diagnostico do analista (score_reason.summary), quando disponivel
    reason = getattr(lead, "score_reason", None) or {}
    diagnostico = reason.get("summary") or ""
    diag_linha = (
        f"Diagnostico (base do gancho): {diagnostico}\n\n" if diagnostico else ""
    )

    ancora = (
        "Ancora obrigatoria: abra a msg1 com UM fato real e especifico deste negocio "
        "(a boa reputacao na regiao, o Instagram parado, a falta de site, o que os "
        "clientes valorizam). NUNCA numero cru. Sem um fato concreto, nao escreva a abertura."
    )

    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"{_SERVICE_BRIEF.get(key, _SERVICE_BRIEF['indefinido'])}\n\n"
        f"{diag_linha}"
        f"Negocio: {b['nome']} ({b['segmento']}) em {b['cidade']}.\n"
        f"Sinais: {sinais_txt}.\n\n"
        f"{ancora}\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )
