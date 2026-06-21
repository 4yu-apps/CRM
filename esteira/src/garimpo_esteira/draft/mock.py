"""Provedor de rascunho mock: template determinístico, offline, R$0.

Reproduz o fluxo de 2 mensagens por serviço (B1) seguindo o GUIA-COPY-HUMANA:
voz humana, curto, UMA pergunta, sem travessão, sem AI-tell. Regra de ouro
aprendida na prática: NÃO abrir citando número de avaliações ou nota (soa
raspado, "empresa X com 38 avaliações" não é como gente fala). Referencia o
negócio de forma natural (nome, ramo, cidade) e varia a abertura por lead.
A copy de verdade (mais lapidada) sai pelo Gemini; isto é o piso decente.
"""
from __future__ import annotations

from ..models import Lead
from .prompt import lead_brief


def _pick(name: str, options: list[str]) -> str:
    """Escolhe uma variante de forma estável por lead (varia sem ser aleatório)."""
    i = sum(ord(c) for c in (name or "x")) % len(options)
    return options[i]


def _abertura(b: dict) -> str:
    nome = b["nome"]
    cidade = b["cidade"]
    seg = (b["segmento"] or "").lower()
    onde = f" em {cidade}" if cidade else " aqui na região"
    opcoes = [
        f"Oi, tudo bem? Vi a {nome}{onde} e curti o trabalho de vocês.",
        f"Oi! Esbarrei na {nome} procurando {seg or 'negócio'}{onde}.",
        f"Oi, tudo bem? Tava de olho em {seg or 'negócios'}{onde} e a {nome} me chamou atenção.",
    ]
    return _pick(nome, opcoes)


def _trafego(b: dict) -> tuple[str, str]:
    if not b["tem_site"]:
        pergunta = "Vocês têm site ou hoje o cliente chega mais pelo Instagram e indicação?"
    elif not b["tem_instagram"]:
        pergunta = "Vocês divulgam mais no Instagram ou é mais no boca a boca?"
    else:
        pergunta = "Vocês já rodam anúncio ou hoje o cliente chega mais por indicação?"
    msg1 = f"{_abertura(b)} {pergunta}"
    msg2 = (
        "Eu trabalho com tráfego pra negócio local, pra você aparecer pra quem já está "
        "procurando perto sem depender do alcance do Instagram. Posso te mandar um exemplo "
        "rápido de como ficaria?"
    )
    return msg1, msg2


def _automacao(b: dict) -> tuple[str, str]:
    nome = b["nome"]
    cidade = b["cidade"]
    onde = f" em {cidade}" if cidade else " aqui"
    abertura = f"Oi! Vi a {nome}{onde}, parece ter um movimento bom de cliente."
    msg1 = f"{abertura} O atendimento e os agendamentos de vocês hoje são tudo na mão pelo WhatsApp?"
    msg2 = (
        "Eu monto um atendimento automático no WhatsApp que responde e agenda sozinho, pra "
        "você não perder cliente nos horários de pico. Quer que eu te mostre como funciona?"
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
            msg2 = msg2.rstrip(" ?") + ", e depois ainda dá pra automatizar o atendimento no WhatsApp?"
            return msg1, msg2
        # tráfego e indefinido caem no roteiro de tráfego
        return _trafego(b)
