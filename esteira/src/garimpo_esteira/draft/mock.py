"""Provedor de rascunho mock — template determinístico, offline, R$0.

Reproduz o fluxo de 2 mensagens usando os mesmos sinais do prompt real. Serve
pra desenvolver e testar a esteira sem chave de LLM. Troca por Gemini via env.
"""
from __future__ import annotations

from ..models import Lead
from .prompt import lead_brief


class MockDraftProvider:
    model = "mock"

    def generate(self, lead: Lead) -> tuple[str, str]:
        b = lead_brief(lead)
        nome = b["nome"]

        if b["nota"] is not None:
            gancho = f"Vi {nome} no Maps — {b['nota']} com {b['avaliacoes'] or 0} avaliacoes"
        else:
            gancho = f"Achei {nome} aqui na regiao"

        if not b["tem_site"]:
            ponte = "e reparei que voces ainda nao tem site"
        elif not b["tem_instagram"]:
            ponte = "e vi que o Instagram ta meio parado"
        else:
            ponte = "e curti a presenca de voces"

        msg1 = f"Oi! {gancho} {ponte}. Voces ja rodam anuncio pra atrair cliente novo da regiao?"
        msg2 = (
            "Pergunto porque com esse nivel de avaliacao da pra escalar agendamento com "
            "trafego local barato. Posso te mandar 2-3 ideias rapidas, sem compromisso?"
        )
        return msg1, msg2
