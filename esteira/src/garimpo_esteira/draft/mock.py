"""Provedor de rascunho mock: template determinístico, offline, R$0.

Segue o GUIA-COPY-HUMANA com tom caloroso, de quem fala com um conhecido:
cumprimento leve, diz que encontrou o negócio e gostou do trabalho, confirma o
que eles fazem e faz UMA pergunta. Sem dumpar nota/avaliações, sem se apresentar
como vendedor, sem travessão. A copy lapidada sai pela IA (Groq/Gemini); isto é
o piso decente quando a IA não está ligada ou falha.
"""
from __future__ import annotations

from ..models import Lead
from .prompt import lead_brief


def _abertura(b: dict) -> str:
    nome = b["nome"]
    seg = (b["segmento"] or "").lower()
    base = f"Oi, tudo bem? Encontrei a {nome} aqui na região e gostei muito do trabalho de vocês."
    if seg:
        base += f" Vi que vocês trabalham com {seg}, certo?"
    return base


def _trafego(b: dict) -> tuple[str, str]:
    if not b["tem_site"]:
        pergunta = "Vocês já têm site ou hoje o cliente chega mais pelo Instagram e indicação?"
    elif not b["tem_instagram"]:
        pergunta = "Vocês divulgam mais no Instagram ou é mais no boca a boca?"
    else:
        pergunta = "Vocês já fazem anúncio pra atrair cliente ou hoje é mais no boca a boca?"
    msg1 = f"{_abertura(b)} {pergunta}"
    msg2 = (
        "Eu trabalho com tráfego pra negócio local, pra você aparecer pra quem já está "
        "procurando perto sem depender do alcance do Instagram. Podemos trocar uma ideia? "
        "posso te mandar um exemplo."
    )
    return msg1, msg2


def _automacao(b: dict) -> tuple[str, str]:
    msg1 = f"{_abertura(b)} O atendimento e os agendamentos de vocês hoje são tudo na mão pelo WhatsApp?"
    msg2 = (
        "Eu monto um atendimento automático no WhatsApp que responde e agenda sozinho, pra você "
        "não perder cliente na correria. Podemos trocar uma ideia? posso te mostrar como funciona."
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
            # lidera com tráfego, cita a automação de leve no fim (upsell)
            msg1, msg2 = _trafego(b)
            msg2 = msg2.rstrip(" .") + ". E depois ainda dá pra automatizar o atendimento no WhatsApp."
            return msg1, msg2
        # tráfego e indefinido caem no roteiro de tráfego
        return _trafego(b)
