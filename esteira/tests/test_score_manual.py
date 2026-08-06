"""Lead cadastrado a mao: o robo enriquece e pontua, mas nao descarta por nota.

O corte por FATO (empresa nao-ATIVA, ou sem nenhum canal de contato) continua
valendo, porque ali nao ha julgamento pra revisar.
"""
from garimpo_esteira.models import Lead
from garimpo_esteira.score_stage import rescore_no_status, score_one
from garimpo_esteira.sink import JsonFileSink


def _sink(tmp_path):
    return JsonFileSink(tmp_path / "db.json")


def _lead(sink, **kw):
    lid = sink.insert_lead(Lead(id="", owner_id="o", status="bruto", **kw))
    sink.set_status(lid, "enriquecido")
    return sink.get_lead(lid)


# Negocio sem nenhum sinal bom: tem telefone (da pra contatar), mas nota rasa.
FRACO = dict(business_name="Padaria do Joao", phone="44999990001",
             website="https://exemplo.com.br", rating=5.0, reviews_count=900)


def test_lead_do_robo_com_nota_baixa_continua_descartado(tmp_path):
    sink = _sink(tmp_path)
    lead = _lead(sink, **FRACO)
    r = score_one(lead, sink, min_score=99)
    assert r.decision == "descartado"
    assert sink.get_lead(lead.id).status == "descartado"


def test_lead_manual_com_nota_baixa_fica_na_fila(tmp_path):
    sink = _sink(tmp_path)
    lead = _lead(sink, manual=True, **FRACO)
    r = score_one(lead, sink, min_score=99)
    assert r.decision == "qualificado"
    assert sink.get_lead(lead.id).status == "qualificado"
    assert "cadastrou esse a mao" in r.reason["verdict"]


def test_lead_manual_salvo_do_corte_nao_fica_sem_servico(tmp_path):
    """Reverter o descarte sem devolver o service_target deixaria um lead
    'qualificado' com servico 'indefinido': incoerente na ficha e mudo na copy."""
    sink = _sink(tmp_path)
    lead = _lead(sink, manual=True, **FRACO)
    r = score_one(lead, sink, min_score=99)
    assert r.service_target != "indefinido"
    assert r.reason["service_target"] == r.service_target
    assert sink.get_lead(lead.id).service_target == r.service_target


def test_lead_manual_sem_contato_continua_descartado(tmp_path):
    """Sem telefone e sem e-mail nao ha o que prospectar. Poupar esse do corte so
    empurraria pra fila um lead que ninguem consegue abordar."""
    sink = _sink(tmp_path)
    lead = _lead(sink, manual=True, business_name="So o nome", rating=4.9, reviews_count=500)
    r = score_one(lead, sink)
    assert r.decision == "descartado"
    assert r.hard_discard is True


def test_lead_manual_de_empresa_baixada_continua_descartado(tmp_path):
    sink = _sink(tmp_path)
    lead = _lead(sink, manual=True, company_status="BAIXADA", **FRACO)
    r = score_one(lead, sink)
    assert r.decision == "descartado"
    assert r.hard_discard is True


def test_rescore_respeita_o_lead_manual_sem_mexer_no_status(tmp_path):
    sink = _sink(tmp_path)
    lead = _lead(sink, manual=True, **FRACO)
    r = rescore_no_status(lead, sink, min_score=99)
    assert r.decision == "qualificado"
    # rescore nunca mexe no status: o lead segue onde estava.
    assert sink.get_lead(lead.id).status == "enriquecido"
