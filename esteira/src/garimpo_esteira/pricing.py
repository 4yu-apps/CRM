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

# Mensalidade base (R$) por servico e porte. Calibrado pra faixa R$400..R$2.500.
# trafego:  pequeno 700, medio 1000, grande 1400, muito grande 1800
# automacao: pequeno 400, medio 600, grande 800,  muito grande 1000
# ambos = trafego + 70% da automacao (pacote): ~1000, 1400, 2000, 2500
_TRAFEGO = [700, 1000, 1400, 1800]
_AUTOMACAO = [400, 600, 800, 1000]


def _tier(reviews_count: int | None) -> tuple[int, str]:
    n = reviews_count or 0
    for i, (limit, label) in enumerate(_TIERS):
        if n < limit:
            return i, label
    return len(_TIERS) - 1, _TIERS[-1][1]


def _round100(v: float) -> int:
    return int(round(v / 100.0) * 100)


def suggest_value(
    service_target: str, reviews_count: int | None, rating: float | None = None
) -> tuple[int, str]:
    """Retorna (valor_mensal_sugerido, motivo_em_pt)."""
    i, porte = _tier(reviews_count)

    if service_target == "automacao":
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

    avals = reviews_count or 0
    nota_txt = f", nota {rating}" if rating else ""
    valor_fmt = f"{value:,}".replace(",", ".")  # 1400 -> "1.400" (padrao BR)
    motivo = (
        f"Negocio de porte {porte} ({avals} avaliacoes{nota_txt}). "
        f"Para {servico_txt}, um valor inicial em torno de R$ {valor_fmt} por mes faz sentido. "
        f"Ajuste na conversa conforme o tamanho e o apetite do cliente."
    )
    return value, motivo
