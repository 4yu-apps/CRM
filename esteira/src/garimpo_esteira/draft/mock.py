"""Provedor de rascunho mock: template deterministico, offline, R$0.

Segue o GUIA-COPY-HUMANA com tom caloroso, de quem fala com um conhecido:
cumprimento leve, diz que encontrou o negocio e gostou do trabalho, confirma o
que eles fazem e faz UMA pergunta aberta. Sem dumpar nota/avaliacoes, sem se
apresentar como vendedor, sem travessao. A copy lapidada sai pela IA
(Groq/Gemini); isto e o piso decente quando a IA nao esta ligada ou falha.

As mensagens sao client-facing: pt-BR com acentuacao correta (vai pro WhatsApp
do cliente). Os comentarios seguem o estilo accent-light do repo.
"""
from __future__ import annotations

from ..models import Lead
from .prompt import _brief_key, lead_brief

# Categorias de alimentacao que pedem angulo iFood
_FOOD_KEYWORDS = (
    "restaurante", "pizzaria", "lanchonete", "hamburgueria", "hamburguer",
    "churrascaria", "padaria", "cafe", "cafeteria", "sushi", "japonesa",
    "italiana", "comida", "buffet", "boteco", "bar e restaurante",
)


def _is_food(b: dict) -> bool:
    seg = (b.get("segmento") or "").lower()
    return any(k in seg for k in _FOOD_KEYWORDS)


def _abertura(b: dict) -> str:
    nome = b["nome"]
    seg = (b["segmento"] or "").lower()
    base = f"Oi, tudo bem? Encontrei a {nome} aqui na região e gostei muito do trabalho de vocês."
    if seg:
        base += f" Vi que vocês trabalham com {seg}, certo?"
    return base


def _trafego(b: dict) -> tuple[str, str]:
    if _is_food(b):
        pergunta = "Vocês já trabalham com iFood ou é mais no salão e entrega própria?"
    elif not b["tem_site"]:
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


def _design(b: dict) -> tuple[str, str]:
    if not b["tem_site"]:
        pergunta = "Vocês já têm um site ou hoje o cliente acha vocês mais pelo Instagram e indicação?"
    else:
        pergunta = "Manter o site atualizado no dia a dia é chato, né? Vocês sentem falta de ter isso no piloto automático?"
    msg1 = f"{_abertura(b)} {pergunta}"
    msg2 = (
        "Eu faço site e identidade visual pra negócio local, bonito e rápido, que passa confiança "
        "e funciona bem no celular. Podemos trocar uma ideia? posso te mandar um exemplo."
    )
    return msg1, msg2


def _marketing(b: dict) -> tuple[str, str]:
    msg1 = f"{_abertura(b)} Quem cuida das redes de vocês hoje, é alguém de fora ou vocês mesmos?"
    msg2 = (
        "Eu cuido das redes de negócio local, pra manter a presença ativa e a marca na cabeça do "
        "cliente, sem você ter que parar pra postar. Podemos trocar uma ideia?"
    )
    return msg1, msg2


class MockDraftProvider:
    model = "mock"

    def generate(self, lead: Lead) -> tuple[str, str]:
        b = lead_brief(lead)
        key = _brief_key(lead)

        if key == "automacao":
            return _automacao(b)
        if key == "design":
            return _design(b)
        if key == "marketing":
            return _marketing(b)
        if key == "ambos":
            # lidera com trafego, cita a automacao de leve no fim (upsell)
            msg1, msg2 = _trafego(b)
            msg2 = msg2.rstrip(" .") + ". E depois ainda dá pra automatizar o atendimento no WhatsApp."
            return msg1, msg2
        # trafego e indefinido caem no roteiro de trafego
        return _trafego(b)
