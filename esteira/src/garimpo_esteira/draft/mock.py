"""Provedor de rascunho mock: template deterministico, offline, R$0.

Segue o GUIA-COPY-HUMANA: tom de quem fala com um conhecido, abertura guiada por
um SINAL REAL do negocio (anuncia? boa reputacao? sem site? sem Instagram?), uma
pergunta genuina e aberta (as vezes ja perguntando quem cuida daquilo), e um
pitch leve no fim, sem marcar reuniao. NUNCA diz "na regiao" (a busca cobre o
Brasil todo): diz que encontrou no Google. A copy lapidada sai pela IA
(Groq/Gemini); isto e o piso decente quando a IA nao esta ligada ou falha.

As mensagens sao client-facing: pt-BR com acentuacao correta (vai pro WhatsApp
do cliente). Sem travessao, sem numero cru, sem cara de vendedor.
"""
from __future__ import annotations

from ..models import Lead
from ..validation import is_present
from .prompt import _brief_key, lead_brief

# Categorias de alimentacao que pedem o angulo iFood (pergunta genuina de canal).
_FOOD_KEYWORDS = (
    "restaurante", "pizzaria", "lanchonete", "hamburgueria", "hamburguer",
    "churrascaria", "padaria", "cafe", "cafeteria", "sushi", "japonesa",
    "italiana", "comida", "buffet", "boteco", "bar e restaurante", "acai",
    "sorveteria", "marmita", "pastel", "doceria", "confeitaria",
)

_GREETINGS = ("Oi, tudo bem?", "Bom dia, tudo certo?", "Opa, tudo bem por aí?")


def _is_food(b: dict) -> bool:
    seg = (b.get("segmento") or "").lower()
    return any(k in seg for k in _FOOD_KEYWORDS)


def _advertises(lead: Lead) -> bool:
    if getattr(lead, "ads_active", None) is True:
        return True
    sig = getattr(lead, "site_signals", None) or {}
    return bool(sig.get("ad_platforms"))


def _greeting(nome: str) -> str:
    # variacao leve e DETERMINISTICA pelo nome (sem random, p/ teste estavel)
    return _GREETINGS[len(nome) % len(_GREETINGS)]


def _gancho(b: dict, lead: Lead) -> str:
    """Clausula curta sobre UM sinal real (a ancora da abertura). Comeca em
    minuscula, pra emendar em 'Encontrei a X no Google e {gancho}.'. Sem repetir
    'vi que voces' e enxuto, pra a abertura nao ficar viciosa nem grande."""
    seg = (b["segmento"] or "").lower()
    com_seg = f" com {seg}" if seg else ""
    boa = b["nota"] is not None and b["nota"] >= 4.5
    if _advertises(lead) and boa:
        return "vi que já anunciam e ainda têm uma ótima reputação"
    if _advertises(lead):
        return "reparei que já estão anunciando"
    if boa and not b["tem_site"]:
        return "a reputação de vocês está ótima, mas não achei um site"
    if not b["tem_site"]:
        return f"gostei do trabalho{com_seg}, mas não encontrei um site"
    if not b["tem_instagram"]:
        return "procurei no Instagram e não achei nada"
    if boa:
        return "gostei do que vi, a reputação está ótima"
    return f"gostei do trabalho{com_seg}"


def _pergunta(b: dict, lead: Lead, service: str) -> str:
    """Pergunta genuina e aberta, ligada ao sinal e ao servico. Quando faz
    sentido, ja puxa quem cuida daquilo (pra descobrir com quem se fala). Sempre
    UMA frase so."""
    if service in ("trafego", "ambos", "indefinido") and _is_food(b):
        return "Vocês já trabalham com iFood ou é mais no salão e entrega própria?"
    if _advertises(lead):
        return "Quem clica no anúncio e não fecha na hora, dá pra retomar esse contato depois?"
    if not b["tem_site"]:
        return "Hoje o cliente novo chega mais por indicação, ou já fazem alguma divulgação?"
    if not b["tem_instagram"]:
        return "Trabalham mais no boca a boca, ou já tentaram as redes pra atrair gente nova?"
    if service == "automacao":
        return "Quem cuida do atendimento e da agenda aí, é tudo na mão pelo WhatsApp?"
    if service == "marketing":
        return "Quem cuida das redes aí hoje, é alguém de fora ou vocês mesmos?"
    if service == "design":
        return "Quem cuida do site de vocês no dia a dia?"
    return "Como o cliente costuma chegar até aí hoje, mais indicação ou divulgação?"


def _abertura(b: dict, lead: Lead, service: str) -> str:
    nome = b["nome"]
    return (
        f"{_greeting(nome)} Encontrei a {nome} no Google e {_gancho(b, lead)}. "
        f"{_pergunta(b, lead, service)}"
    )


# Pitch leve (msg2) por servico. Valor em uma frase + convite aberto, nunca
# reuniao de cara. Cada um carrega a palavra-chave do servico (pro humano e pros
# testes reconhecerem o angulo).
_PITCH = {
    "trafego": (
        "Eu trabalho com tráfego pra negócio local, pra você aparecer pra quem já "
        "está procurando perto sem depender da sorte do Instagram. Se quiser, te "
        "mando um exemplo de como ficaria."
    ),
    "automacao": (
        "Eu monto um atendimento automático no WhatsApp que responde e agenda "
        "sozinho, pra não escapar cliente quando aperta. Se fizer sentido, te "
        "mostro como funciona."
    ),
    "ambos": (
        "Eu ajudo negócio local a atrair mais cliente e, se precisar, automatizar "
        "o atendimento pra não perder ninguém na correria. Faz sentido a gente "
        "trocar uma ideia?"
    ),
    "design": (
        "Eu cuido de site e visual pra negócio local, bonito e rápido, que passa "
        "confiança pra quem encontra vocês. Posso te mandar um exemplo?"
    ),
    "marketing": (
        "Eu cuido das redes de negócio local, pra manter a marca ativa sem você "
        "ter que parar pra postar. Faz sentido a gente trocar uma ideia?"
    ),
}


class MockDraftProvider:
    model = "mock"

    def generate(self, lead: Lead) -> tuple[str, str]:
        b = lead_brief(lead)
        service = _brief_key(lead)
        msg1 = _abertura(b, lead, service)
        msg2 = _PITCH.get(service, _PITCH["trafego"])
        return msg1, msg2
