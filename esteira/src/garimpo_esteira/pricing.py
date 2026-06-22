"""Sugestao de valor (B8): quanto cobrar daquele lead, com criterio explicavel.

Regra pura, sem IA: o valor sai do cruzamento de DOIS sinais simples e honestos:

  porte do negocio  x  servico (trafego, automacao, ambos)

O porte e estimado pelo numero de avaliacoes no Maps (proxy de movimento /
tamanho). Quanto maior o movimento, mais o negocio aguenta investir. Trafego
custa mais que automacao; "ambos" e o pacote (com desconto no segundo servico).

E sempre uma SUGESTAO, com o motivo escrito em portugues. Quem decide o valor
final e a humana, na conversa. Faixa tipica: R$ 400 a R$ 2.500 por mes.
"""
from __future__ import annotations

# Faixas de porte pelo numero de avaliacoes (movimento do negocio).
# (rotulo, indice). Indice 0..3 = pequeno, medio, grande, muito grande.
_TIERS = [
    (50, "pequeno"),       # < 50 avaliacoes
    (200, "medio"),        # 50 a 199
    (600, "grande"),       # 200 a 599
    (10**9, "muito grande"),  # 600+
]

# Valor base (R$) por servico e porte.
# Servicos MENSAIS (recorrente): trafego, automacao, ambos, marketing.
# trafego:  pequeno 700, medio 1000, grande 1400, muito grande 1800
# automacao: pequeno 400, medio 600, grande 800,  muito grande 1000
# marketing: pequeno 600, medio 900, grande 1200, muito grande 1600
_TRAFEGO = [700, 1000, 1400, 1800]
_AUTOMACAO = [400, 600, 800, 1000]
_MARKETING = [600, 900, 1200, 1600]
# Servico de PROJETO (valor unico): design/web. Site institucional/landing.
# E-commerce custa mais (catalogo, carrinho, pagamento): multiplicador.
_DESIGN_SITE = [1500, 2500, 4000, 6000]
_ECOMMERCE_MULT = 1.6

# Pistas de e-commerce (categoria do Maps ou stack do site).
_ECOM_CATEGORY = ("loja", "roupas", "moda", "boutique", "store", "comercio", "calcad", "acessor")
_ECOM_STACK = {"shopify", "loja_integrada", "woocommerce", "nuvemshop"}


def _tier(reviews_count: int | None) -> tuple[int, str]:
    n = reviews_count or 0
    for i, (limit, label) in enumerate(_TIERS):
        if n < limit:
            return i, label
    return len(_TIERS) - 1, _TIERS[-1][1]


def _round100(v: float) -> int:
    return int(round(v / 100.0) * 100)


def _is_ecommerce(category: str | None, stack: str | None) -> bool:
    cat = (category or "").lower()
    if any(k in cat for k in _ECOM_CATEGORY):
        return True
    return (stack or "").lower() in _ECOM_STACK


def suggest_value(
    service_target: str,
    reviews_count: int | None,
    rating: float | None = None,
    *,
    category: str | None = None,
    stack: str | None = None,
) -> tuple[int, str]:
    """Retorna (valor_sugerido, motivo_em_pt). Mensal pra servicos recorrentes;
    valor de PROJETO (unico) pra design/web."""
    i, porte = _tier(reviews_count)
    avals = reviews_count or 0
    nota_txt = f", nota {rating}" if rating else ""
    porte_txt = f"Negocio de porte {porte} ({avals} avaliacoes{nota_txt}). "

    # design/web: valor de projeto (unico), nao mensal.
    if service_target == "design":
        ecom = _is_ecommerce(category, stack)
        value = _round100(_DESIGN_SITE[i] * (_ECOMMERCE_MULT if ecom else 1.0))
        valor_fmt = f"{value:,}".replace(",", ".")
        tipo = "uma loja online (e-commerce)" if ecom else "um site institucional ou landing"
        motivo = (
            f"{porte_txt}Para {tipo}, um projeto fica em torno de R$ {valor_fmt} (valor unico). "
            f"Ajuste na conversa conforme numero de paginas, e-commerce e identidade visual."
        )
        return value, motivo

    if service_target == "marketing":
        value = _MARKETING[i]
        servico_txt = "gestao de redes (social media)"
    elif service_target == "automacao":
        value = _AUTOMACAO[i]
        servico_txt = "automacao de atendimento"
    elif service_target == "ambos":
        # pacote: trafego cheio + automacao com desconto
        value = _round100(_TRAFEGO[i] + _AUTOMACAO[i] * 0.7)
        servico_txt = "trafego e automacao"
    else:
        # trafego ou indefinido: usa a tabela de trafego
        value = _TRAFEGO[i]
        servico_txt = "gestao de trafego"

    valor_fmt = f"{value:,}".replace(",", ".")  # 1400 -> "1.400" (padrao BR)
    motivo = (
        f"{porte_txt}Para {servico_txt}, um valor inicial em torno de R$ {valor_fmt} por mes faz sentido. "
        f"Ajuste na conversa conforme o tamanho e o apetite do cliente."
    )
    return value, motivo
