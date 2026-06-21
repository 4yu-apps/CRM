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

# Foco da copy por servico (B1) — orienta o gancho e o pitch.
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
    "indefinido": (
        "Servico: a definir; lidere com trafego (anuncio local) como padrao."
    ),
}


def build_prompt(lead: Lead) -> str:
    b = lead_brief(lead)
    target = getattr(lead, "service_target", "indefinido") or "indefinido"
    # contexto pra VOCE, modelo. NAO repita numeros na mensagem (ver regra critica).
    sinais = []
    if b["nota"] is not None and b["nota"] >= 4.3:
        sinais.append("boa reputacao no Google (bem avaliado)")
    elif b["nota"] is not None:
        sinais.append("reputacao mediana")
    if not b["tem_site"]:
        sinais.append("nao tem site (descuido digital, oportunidade)")
    if not b["tem_instagram"]:
        sinais.append("sem presenca no Instagram")
    sinais_txt = "; ".join(sinais) or "poucos sinais publicos"
    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"{_SERVICE_BRIEF.get(target, _SERVICE_BRIEF['indefinido'])}\n\n"
        f"Negocio: {b['nome']} ({b['segmento']}) em {b['cidade']}.\n"
        f"Sinais: {sinais_txt}.\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )
