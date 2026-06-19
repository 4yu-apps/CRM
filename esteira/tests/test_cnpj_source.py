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
