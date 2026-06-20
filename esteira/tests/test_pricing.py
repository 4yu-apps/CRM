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
