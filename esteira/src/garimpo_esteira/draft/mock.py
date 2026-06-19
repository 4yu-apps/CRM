"""Provedor de rascunho mock: template determinístico, offline, R$0.

Reproduz o fluxo de 2 mensagens por serviço (B1), usando os mesmos sinais do
prompt real e seguindo o GUIA-COPY-HUMANA (voz humana, sem travessão, sem
AI-tell). Serve pra desenvolver e testar a esteira sem chave de LLM. Troca por
Gemini via env.
"""
from __future__ import annotations

from ..models import Lead
from .prompt import lead_brief


def _gancho(b: dict) -> str:
    nome = b["nome"]
    if b["nota"] is not None:
        return f"Oi, tudo bem? Achei {nome} no Maps, {b['nota']} com {b['avaliacoes'] or 0} avaliações"
    return f"Oi, tudo bem? Achei {nome} aqui na região"


def _trafego(b: dict) -> tuple[str, str]:
    if not b["tem_site"]:
        ponte = "e reparei que vocês ainda não têm site"
    elif not b["tem_instagram"]:
        ponte = "e vi que o Instagram tá meio parado"
    else:
        ponte = "e curti o movimento de vocês"
    msg1 = f"{_gancho(b)} {ponte}. Vocês já rodam anúncio ou hoje é mais no boca a boca?"
    msg2 = (
        "Trabalho com tráfego pra negócio local aqui da região e dá pra você aparecer "
        "pra quem busca perto sem depender da sorte do Instagram. Posso te mandar um "
        "exemplo de como ficaria?"
    )
    return msg1, msg2


def _automacao(b: dict) -> tuple[str, str]:
    nome = b["nome"]
    if b["avaliacoes"]:
        abertura = f"Oi! Vi {nome} aqui, {b['avaliacoes']} avaliações, bastante gente"
    else:
        abertura = f"Oi! Vi {nome} aqui na região, parece ter bom movimento"
    msg1 = f"{abertura}. O atendimento e o agendamento de vocês hoje é tudo na mão pelo WhatsApp?"
    msg2 = (
        "Eu monto um atendimento automático no WhatsApp que responde e agenda sozinho, "
        "sem você perder cliente quando tá cheio. Quer que eu te mostre como funciona?"
    )
    return msg1, msg2


class MockDraftProvider:
    model = "mock"

    def generate(self, lead: Lead) -> tuple[str, str]:
        b = lead_brief(lead)
        target = getattr(lead, "service_target", "indefinido")

        if target == "automacao":
            return _automacao(b)
        if target == "ambos":
            # lidera com tráfego, cita automação de leve no fim (upsell)
            msg1, msg2 = _trafego(b)
            msg2 = msg2.rstrip(" ?") + ", e ainda dá pra automatizar o atendimento depois?"
            return msg1, msg2
        # trafego e indefinido caem no roteiro de tráfego
        return _trafego(b)
