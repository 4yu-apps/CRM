from garimpo_esteira.models import Lead
from garimpo_esteira.sources import CnpjSource

FAKE = {
    "11222333000144": {
        "ddd_telefone_1": "44 99999-0002",
        "email": "contato@studiobella.com.br",
        "qsa": [{"nome_socio": "Marina Alves"}],
        "razao_social": "STUDIO BELLA ESTETICA LTDA",
    }
}


def _lead(**kw) -> Lead:
    return Lead(id="l1", owner_id="o1", **kw)


def test_cnpj_source_yields_findings():
    src = CnpjSource(fetch=lambda c: FAKE.get(c))
    findings = src.enrich(_lead(cnpj="11.222.333/0001-44"))
    by_field = {f.field_name: f for f in findings}
    assert by_field["phone"].value == "44999990002"
    assert by_field["phone"].source == "cnpj_brasilapi"
    assert by_field["owner_name"].value == "Marina Alves"
    assert by_field["email"].value == "contato@studiobella.com.br"


def test_cnpj_source_without_cnpj_is_silent():
    src = CnpjSource(fetch=lambda c: FAKE.get(c))
    assert src.enrich(_lead()) == []


def test_cnpj_source_unknown_cnpj_returns_empty():
    src = CnpjSource(fetch=lambda c: None)
    assert src.enrich(_lead(cnpj="99.999.999/9999-99")) == []


def test_owner_falls_back_to_razao_social_with_lower_confidence():
    data = {"00000000000191": {"razao_social": "EMPRESA SEM SOCIO LTDA", "qsa": []}}
    src = CnpjSource(fetch=lambda c: data.get(c))
    findings = src.enrich(_lead(cnpj="00.000.000/0001-91"))
    owner = next(f for f in findings if f.field_name == "owner_name")
    assert owner.value == "EMPRESA SEM SOCIO LTDA"
    assert owner.confidence == 0.5


def test_cnpj_source_captures_opened_on():
    # BrasilAPI ja devolve data_inicio_atividade em ISO (YYYY-MM-DD); capturamos.
    data = {"11222333000144": {"ddd_telefone_1": "44 99999-0002", "data_inicio_atividade": "2021-05-10"}}
    src = CnpjSource(fetch=lambda c: data.get(c))
    findings = src.enrich(_lead(cnpj="11.222.333/0001-44"))
    opened = next(f for f in findings if f.field_name == "opened_on")
    assert opened.value == "2021-05-10"
    assert opened.source == "cnpj_brasilapi"


def test_cnpj_source_opened_on_aceita_barra():
    # algumas respostas vem em DD/MM/YYYY; normalizamos pra ISO
    data = {"11222333000144": {"data_inicio_atividade": "10/05/2021"}}
    src = CnpjSource(fetch=lambda c: data.get(c))
    findings = src.enrich(_lead(cnpj="11.222.333/0001-44"))
    opened = next(f for f in findings if f.field_name == "opened_on")
    assert opened.value == "2021-05-10"


def test_cnpj_source_without_open_date_is_silent_on_opened_on():
    data = {"11222333000144": {"ddd_telefone_1": "44 99999-0002"}}
    src = CnpjSource(fetch=lambda c: data.get(c))
    findings = src.enrich(_lead(cnpj="11.222.333/0001-44"))
    assert all(f.field_name != "opened_on" for f in findings)


# ------------------------------------------------------------------
# O3 waterfall de CNPJ: BrasilAPI -> (falha/limite) -> ReceitaWS (cnpj_ws).
# Tudo gratis; proveniencia por fonte (cada achado leva quem o achou).
# ------------------------------------------------------------------

def test_cnpj_waterfall_cai_pro_receitaws_quando_brasilapi_falha():
    rw = {"11222333000144": {
        "status": "OK", "telefone": "44 99999-0002", "nome": "EMPRESA X LTDA",
        "abertura": "10/05/2021", "qsa": [{"nome": "Marina Alves", "qual": "Socia"}],
    }}
    src = CnpjSource(providers=[
        ("cnpj_brasilapi", lambda c: None),  # BrasilAPI fora/limite
        ("cnpj_ws", lambda c: rw.get(c)),
    ])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["phone"].source == "cnpj_ws"
    assert by["phone"].value == "44999990002"
    assert by["owner_name"].value == "Marina Alves"
    assert by["opened_on"].value == "2021-05-10"


def test_cnpj_waterfall_prefere_brasilapi_e_nao_chama_fallback():
    calls = {"ws": 0}

    def ws(c):
        calls["ws"] += 1
        return {"status": "OK", "telefone": "11 11111-1111"}

    ba = {"11222333000144": {"ddd_telefone_1": "44 99999-0002"}}
    src = CnpjSource(providers=[
        ("cnpj_brasilapi", lambda c: ba.get(c)),
        ("cnpj_ws", ws),
    ])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["phone"].source == "cnpj_brasilapi"
    assert calls["ws"] == 0


def test_receitaws_mapeia_campos_e_normaliza_data():
    rw = {"11222333000144": {
        "status": "OK", "telefone": "44 99999-0002", "email": "c@x.com",
        "nome": "EMPRESA X LTDA", "abertura": "01/02/2020",
        "qsa": [{"nome": "Joao Souza", "qual": "Socio"}],
    }}
    src = CnpjSource(providers=[("cnpj_ws", lambda c: rw.get(c))])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["phone"].value == "44999990002"
    assert by["email"].value == "c@x.com"
    assert by["owner_name"].value == "Joao Souza"
    assert by["owner_name"].source == "cnpj_ws"
    assert by["opened_on"].value == "2020-02-01"


def test_receitaws_status_error_pula_pro_proximo():
    rw = {"11222333000144": {"status": "ERROR", "message": "CNPJ rejeitado"}}
    ba = {"11222333000144": {"ddd_telefone_1": "44 98888-0000"}}
    src = CnpjSource(providers=[
        ("cnpj_ws", lambda c: rw.get(c)),
        ("cnpj_brasilapi", lambda c: ba.get(c)),
    ])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["phone"].source == "cnpj_brasilapi"
    assert by["phone"].value == "44988880000"


def test_cnpj_waterfall_provider_que_explode_nao_derruba():
    def boom(c):
        raise RuntimeError("rede caiu")

    ba = {"11222333000144": {"ddd_telefone_1": "44 97777-0000"}}
    src = CnpjSource(providers=[
        ("cnpj_ws", boom),
        ("cnpj_brasilapi", lambda c: ba.get(c)),
    ])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["phone"].source == "cnpj_brasilapi"


# ------------------------------------------------------------------
# Fase 4: situacao cadastral (empresa morta) + CNAE (ramo real)
# ------------------------------------------------------------------

def test_brasilapi_captura_situacao_e_cnae():
    data = {"11222333000144": {
        "descricao_situacao_cadastral": "BAIXADA",
        "cnae_fiscal_descricao": "Cabeleireiros, manicure e pedicure",
    }}
    src = CnpjSource(fetch=lambda c: data.get(c))
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["company_status"].value == "BAIXADA"
    assert by["category"].value == "Cabeleireiros, manicure e pedicure"


def test_receitaws_captura_situacao_e_cnae():
    rw = {"11222333000144": {
        "status": "OK", "situacao": "ativa",
        "atividade_principal": [{"text": "Restaurantes e similares"}],
    }}
    src = CnpjSource(providers=[("cnpj_ws", lambda c: rw.get(c))])
    by = {f.field_name: f for f in src.enrich(_lead(cnpj="11.222.333/0001-44"))}
    assert by["company_status"].value == "ATIVA"  # normaliza pra maiuscula
    assert by["category"].value == "Restaurantes e similares"


def test_sem_situacao_nao_emite_company_status():
    data = {"11222333000144": {"ddd_telefone_1": "44 99999-0002"}}
    src = CnpjSource(fetch=lambda c: data.get(c))
    findings = src.enrich(_lead(cnpj="11.222.333/0001-44"))
    assert all(f.field_name != "company_status" for f in findings)
