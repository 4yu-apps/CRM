"""Testes da sugestao de valor (B8): criterio porte x servico, e a integracao
no estagio de score (lead qualificado ja sai com valor sugerido)."""
from garimpo_esteira.models import Lead
from garimpo_esteira.pricing import suggest_value
from garimpo_esteira.score_stage import score_one
from garimpo_esteira.sink import JsonFileSink


# ---- criterio puro ----

def test_porte_maior_paga_mais():
    pequeno, _ = suggest_value("trafego", 30)
    grande, _ = suggest_value("trafego", 400)
    assert grande > pequeno


def test_trafego_custa_mais_que_automacao_no_mesmo_porte():
    traf, _ = suggest_value("trafego", 150)
    auto, _ = suggest_value("automacao", 150)
    assert traf > auto


def test_ambos_e_pacote_maior_que_um_servico_so():
    ambos, _ = suggest_value("ambos", 150)
    traf, _ = suggest_value("trafego", 150)
    assert ambos > traf  # pacote soma o segundo servico (com desconto)


def test_indefinido_usa_tabela_de_trafego():
    indef, _ = suggest_value("indefinido", 150)
    traf, _ = suggest_value("trafego", 150)
    assert indef == traf


def test_valor_fica_na_faixa_esperada():
    for st in ("trafego", "automacao", "ambos"):
        for revs in (0, 100, 300, 1000):
            v, _ = suggest_value(st, revs)
            assert 200 <= v <= 2500, (st, revs, v)


def test_marketing_faixa_atualizada_por_porte():
    # gestao de redes: 800 / 1.200 / 1.600 / 2.200 por porte crescente
    assert suggest_value("marketing", 30)[0] == 800     # pequeno
    assert suggest_value("marketing", 100)[0] == 1200   # medio
    assert suggest_value("marketing", 400)[0] == 1600   # grande
    assert suggest_value("marketing", 1000)[0] == 2200  # muito grande
    _, motivo = suggest_value("marketing", 100)
    assert "redes" in motivo.lower() or "social" in motivo.lower()


def test_valor_e_multiplo_de_100():
    for st in ("trafego", "automacao", "ambos"):
        v, _ = suggest_value(st, 300)
        assert v % 100 == 0


def test_motivo_em_pt_sem_travessao_e_com_contexto():
    _, motivo = suggest_value("ambos", 210, rating=4.6)
    assert "porte" in motivo
    assert "avaliacoes" in motivo
    assert "R$" in motivo
    # zero travessoes (regra do projeto)
    for dash in ("‒", "–", "—", "―", "−"):
        assert dash not in motivo


def test_sem_avaliacoes_trata_como_pequeno():
    v_none, _ = suggest_value("trafego", None)
    v_zero, _ = suggest_value("trafego", 0)
    v_peq, _ = suggest_value("trafego", 10)
    assert v_none == v_zero == v_peq


# ---- integracao no estagio de score ----

def test_score_stage_grava_valor_sugerido_em_qualificado(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    # lead com telefone + nota boa + volume -> qualifica
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="enriquecido",
        business_name="Estetica Bela", phone="44999990001",
        rating=4.7, reviews_count=210,
    ))
    lead = sink.get_lead(lid)
    result = score_one(lead, sink)

    saved = sink.get_lead(lid)
    if result.decision == "qualificado":
        assert saved.suggested_value is not None
        assert saved.suggested_value >= 200
        assert saved.suggested_value_reason
    else:  # se a regra mudar e descartar, nao deve sugerir valor
        assert saved.suggested_value is None


def test_score_stage_nao_sugere_valor_pra_descartado(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    # sem telefone -> descartado (regra dura) -> sem valor sugerido
    lid = sink.insert_lead(Lead(
        id="", owner_id="o", status="enriquecido",
        business_name="Sem Telefone", rating=4.8, reviews_count=300,
    ))
    lead = sink.get_lead(lid)
    score_one(lead, sink)
    saved = sink.get_lead(lid)
    assert saved.suggested_value is None


# ---- advocacia: porte pelo retrato societario, nao por avaliacoes ----

def test_advocacia_usa_capital_e_socios_nao_avaliacoes():
    grande_sem_reviews, _ = suggest_value(
        "advocacia", 5, capital_social=800000.0, socios_count=4)
    pequeno_com_reviews, _ = suggest_value(
        "advocacia", 900, capital_social=5000.0, socios_count=1)
    assert grande_sem_reviews > pequeno_com_reviews


def test_advocacia_porte_da_receita_conta():
    sem, _ = suggest_value("advocacia", 10, capital_social=60000.0)
    com, _ = suggest_value("advocacia", 10, capital_social=60000.0, porte="DEMAIS")
    assert com > sem


def test_advocacia_avisa_da_tabela_da_seccional():
    _, motivo = suggest_value("advocacia", 10, capital_social=100000.0)
    assert "seccional" in motivo.lower()
    assert "aviltamento" in motivo.lower()


def test_advocacia_fica_na_faixa_de_avenca():
    for cap in (0.0, 50000.0, 300000.0, 2000000.0):
        v, _ = suggest_value("advocacia", 20, capital_social=cap)
        assert 1500 <= v <= 4500, (cap, v)


def test_advocacia_sem_firmografia_nao_quebra():
    v, motivo = suggest_value("advocacia", None)
    assert v == 1500 and "avenca" in motivo.lower()
