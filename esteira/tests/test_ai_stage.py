"""Leitura da IA — valida o parse (clamp/limpeza), a cadeia com call injetado e
o apply_ai (grava ai_signals + hours_struct). Tudo offline."""
from garimpo_esteira import ai_stage
from garimpo_esteira.models import Lead
from garimpo_esteira.sink import JsonFileSink


def test_parse_ai_valida_e_limpa():
    raw = {
        "segment": "barbearia premium", "maturity": 4,
        "maturity_note": "tem site e IG ativo", "pain": "some no Google",
        "hours": {"days": {"mon": [["0900", "1800"]], "sun": "x"}},
    }
    out = ai_stage.parse_ai(raw)
    assert out["segment"] == "barbearia premium"
    assert out["maturity"] == 4
    assert out["pain"].startswith("some")
    assert out["hours"]["days"]["mon"] == [["0900", "1800"]]
    assert "sun" not in out["hours"]["days"]  # span inválido descartado


def test_parse_ai_maturity_fora_da_faixa_ignora():
    out = ai_stage.parse_ai({"maturity": 9, "segment": "x"})
    assert "maturity" not in out
    assert out["segment"] == "x"


def test_parse_ai_vazio_none():
    assert ai_stage.parse_ai({}) is None
    assert ai_stage.parse_ai({"lixo": 1}) is None


def test_make_reader_none_sem_chave():
    assert ai_stage.make_ai_reader() is None


def test_reader_com_call_injetado():
    reader = ai_stage.make_ai_reader(call=lambda prompt: {"segment": "salao", "maturity": 3})
    assert reader(Lead(id="1", owner_id="o", business_name="Salao X")) == {"segment": "salao", "maturity": 3}


def test_reader_engole_erro_do_call():
    def boom(_p):
        raise RuntimeError("x")
    reader = ai_stage.make_ai_reader(call=boom)
    assert reader(Lead(id="1", owner_id="o")) is None


def test_apply_ai_grava_signals_e_hours(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    lid = sink.insert_lead(Lead(id="", owner_id="o", business_name="X"))
    lead = sink.get_lead(lid)
    reader = ai_stage.make_ai_reader(call=lambda _p: {
        "segment": "barbearia", "maturity": 2,
        "hours": {"days": {"mon": [["0900", "1800"]]}},
    })
    ai_stage.apply_ai(reader, lead, sink)
    refreshed = sink.get_lead(lid)
    assert refreshed.ai_signals["segment"] == "barbearia"
    assert refreshed.ai_signals["maturity"] == 2
    assert refreshed.hours_struct["days"]["mon"] == [["0900", "1800"]]


def test_apply_ai_reader_none_no_op(tmp_path):
    sink = JsonFileSink(tmp_path / "db.json")
    lid = sink.insert_lead(Lead(id="", owner_id="o"))
    ai_stage.apply_ai(None, sink.get_lead(lid), sink)  # não quebra
    assert sink.get_lead(lid).ai_signals is None


def test_prompt_marketing_ganha_angulo_de_presenca():
    lead = Lead(id="1", owner_id="o", business_name="Salao X")
    base = ai_stage.build_ai_prompt(lead)
    mkt = ai_stage.build_ai_prompt(lead, "marketing")
    assert "PRESENCA DIGITAL" in mkt
    assert "PRESENCA DIGITAL" not in base
    # area sem tratamento proprio herda o SYSTEM padrao (sem linha extra)
    assert ai_stage.build_ai_prompt(lead, "trafego") == base


def test_reader_repassa_profession():
    vistos = []
    reader = ai_stage.make_ai_reader(call=lambda prompt: (vistos.append(prompt), {"segment": "x"})[1])
    reader(Lead(id="1", owner_id="o", business_name="X"), "marketing")
    assert "PRESENCA DIGITAL" in vistos[0]


# ------------------------------------------------------------------
# Area de advocacia: leitura institucional e a separacao exposure/context,
# que e o que sustenta a muralha (exposure so na ficha, context na copy).
# ------------------------------------------------------------------

def test_prompt_de_advocacia_fala_de_maturidade_institucional():
    lead = Lead(id="1", owner_id="o", business_name="Empresa X",
                natureza_juridica="206-2 - Sociedade Empresaria Limitada",
                socios_count=3, capital_social=250000.0)
    p = ai_stage.build_ai_prompt(lead, "advocacia")
    assert "AREA DO DONO: ADVOCACIA" in p
    assert "exposure" in p and "context" in p
    assert "natureza juridica" in p.lower()


def test_prompt_de_outra_area_nao_muda():
    lead = Lead(id="1", owner_id="o", business_name="Empresa X")
    assert ai_stage.build_ai_prompt(lead, "trafego") == ai_stage.build_ai_prompt(lead, None)


def test_parse_ai_aceita_exposure_e_context():
    out = ai_stage.parse_ai({"segment": "transportadora", "maturity": 3,
                    "exposure": "rotatividade alta e sem politica de privacidade",
                    "context": "empresa com 12 anos e 3 socios"})
    assert out["exposure"].startswith("rotatividade")
    assert out["context"].startswith("empresa com 12 anos")
