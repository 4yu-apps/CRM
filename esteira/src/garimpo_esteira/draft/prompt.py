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
    "Voce escreve a PRIMEIRA abordagem fria (cold outreach) B2B no WhatsApp para "
    "um gestor de trafego prospectar negocios locais. Tom humano, curto, sem "
    "parecer template ou spam. Portugues do Brasil. NUNCA invente dados. Gere "
    "exatamente 2 mensagens: (1) abertura que conecta com um sinal real do negocio "
    "e faz UMA pergunta; (2) pitch curto propondo valor e pedindo permissao para "
    "continuar. Cada mensagem com no maximo 2 frases."
)


def build_prompt(lead: Lead) -> str:
    b = lead_brief(lead)
    sinais = []
    if b["nota"] is not None:
        sinais.append(f"nota {b['nota']} no Google ({b['avaliacoes'] or 0} avaliacoes)")
    if not b["tem_site"]:
        sinais.append("nao tem site (descuido digital, oportunidade de design/SEO)")
    if not b["tem_instagram"]:
        sinais.append("sem presenca no Instagram")
    sinais_txt = "; ".join(sinais) or "poucos sinais publicos"
    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"Negocio: {b['nome']} ({b['segmento']}) em {b['cidade']}.\n"
        f"Sinais: {sinais_txt}.\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )
