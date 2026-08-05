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
# marketing: pequeno 800, medio 1200, grande 1600, muito grande 2200
# (social media bem feito = conteudo + gestao; a faixa antiga subestimava)
_TRAFEGO = [700, 1000, 1400, 1800]
_AUTOMACAO = [400, 600, 800, 1000]
_MARKETING = [800, 1200, 1600, 2200]
# Servico de PROJETO (valor unico): design/web. Site institucional/landing.
# E-commerce custa mais (catalogo, carrinho, pagamento): multiplicador.
_DESIGN_SITE = [1500, 2500, 4000, 6000]
# Avenca mensal de ADVOCACIA. O porte NAO sai de avaliacoes no Maps: ninguem
# avalia escritorio como avalia pizzaria, e uma empresa grande com poucas
# avaliacoes cairia em "porte pequeno". Sai de capital social + porte da
# Receita + numero de socios, que e o retrato real do tamanho da empresa.
_ADVOCACIA = [1500, 2200, 3200, 4500]
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


def _tier_juridico(
    capital_social: float | None, socios_count: int | None, porte: str | None
) -> tuple[int, str]:
    """Porte pelo retrato societario, nao pelo movimento no Maps."""
    try:
        cap = float(capital_social) if capital_social is not None else 0.0
    except (TypeError, ValueError):
        cap = 0.0
    i = 0
    if cap >= 1_000_000:
        i = 3
    elif cap >= 200_000:
        i = 2
    elif cap >= 50_000:
        i = 1
    try:
        socios = int(socios_count) if socios_count is not None else 0
    except (TypeError, ValueError):
        socios = 0
    if socios >= 3:
        i = min(i + 1, 3)
    if (porte or "").upper() in ("DEMAIS", "GRANDE"):
        i = min(i + 1, 3)
    return i, ("pequeno", "medio", "grande", "muito grande")[i]


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
    capital_social: float | None = None,
    socios_count: int | None = None,
    porte: str | None = None,
) -> tuple[int, str]:
    """Retorna (valor_sugerido, motivo_em_pt). Mensal pra servicos recorrentes;
    valor de PROJETO (unico) pra design/web."""
    # advocacia: avenca mensal, com porte lido do retrato societario. Vem ANTES
    # de _tier() de proposito: aquela linha reusa o nome `porte` pro rotulo do
    # Maps e sombrearia o parametro (porte da Receita) que este ramo precisa.
    if service_target == "advocacia":
        j, porte_j = _tier_juridico(capital_social, socios_count, porte)
        value = _ADVOCACIA[j]
        valor_fmt = f"{value:,}".replace(",", ".")
        socios_txt = f", {socios_count} socios" if socios_count else ""
        motivo = (
            f"Empresa de porte {porte_j} (capital declarado{socios_txt}). "
            f"Para assessoria juridica consultiva, uma avenca em torno de "
            f"R$ {valor_fmt} por mes faz sentido. Confira a tabela de honorarios "
            f"da sua seccional da OAB: cobrar abaixo do piso e aviltamento."
        )
        return value, motivo

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
