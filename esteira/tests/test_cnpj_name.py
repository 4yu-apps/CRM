from garimpo_esteira.models import Lead
from garimpo_esteira.sources.cnpj_name import CnpjNameSource, pick_cnpj


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", business_name="Barbearia Corte Fino",
                phone="44999990000", city="Maringa", state="PR", neighborhood="Zona 7",
                address="Rua das Flores, 100, Zona 7, Maringa - PR")
    base.update(kw)
    return Lead(**base)


def _cand(**kw) -> dict:
    base = dict(cnpj="11.222.333/0001-44", nome="Barbearia Corte Fino LTDA",
                phone=None, city="Maringa", neighborhood="Zona 7",
                street="Rua das Flores", uf="PR")
    base.update(kw)
    return base


# ------------------------------------------------------------------
# pick_cnpj: validacao cruzada precision-first
# ------------------------------------------------------------------

def test_telefone_bate_aceita_forte():
    picked = pick_cnpj(_lead(), [_cand(phone="44 99999-0000")])
    assert picked is not None
    cnpj, conf, _ = picked
    assert cnpj == "11222333000144"
    assert conf == 0.9


def test_sem_telefone_cidade_bairro_nome_alto_aceita():
    picked = pick_cnpj(_lead(phone=None), [_cand(phone=None)])
    assert picked is not None
    assert picked[1] == 0.7


def test_sem_telefone_nome_fraco_rejeita():
    # cidade+bairro batem, mas nome nao parece -> nao anexa (melhor vazio que errado)
    picked = pick_cnpj(_lead(phone=None), [_cand(nome="Mercado Sao Jose", phone=None)])
    assert picked is None


def test_so_nome_sem_cidade_nem_telefone_rejeita():
    picked = pick_cnpj(
        _lead(phone=None, city=None, neighborhood=None, address=None),
        [_cand(phone=None, city=None, neighborhood=None, street=None)],
    )
    assert picked is None


def test_telefone_diferente_e_cidade_diferente_rejeita():
    picked = pick_cnpj(
        _lead(phone="44999990000"),
        [_cand(phone="11 3333-0000", city="Sao Paulo", neighborhood="Centro", street="Av Paulista")],
    )
    assert picked is None


def test_dois_candidatos_passam_e_ambiguo_rejeita():
    c1 = _cand(cnpj="11.222.333/0001-44", phone="44 99999-0000")
    c2 = _cand(cnpj="55.666.777/0001-88", phone="44 99999-0000")
    assert pick_cnpj(_lead(), [c1, c2]) is None


def test_mesmo_cnpj_repetido_nao_e_ambiguo():
    c1 = _cand(cnpj="11.222.333/0001-44", phone="44 99999-0000")
    c2 = _cand(cnpj="11222333000144", phone="44 99999-0000")
    picked = pick_cnpj(_lead(), [c1, c2])
    assert picked is not None and picked[0] == "11222333000144"


def test_rua_no_endereco_conta_como_local():
    # sem bairro batendo, mas a rua do candidato aparece no endereco do lead
    picked = pick_cnpj(
        _lead(phone=None, neighborhood=None),
        [_cand(phone=None, neighborhood="Outro", street="Rua das Flores")],
    )
    assert picked is not None and picked[1] == 0.7


def test_candidato_sem_cnpj_valido_ignorado():
    assert pick_cnpj(_lead(), [_cand(cnpj="123")]) is None


# ------------------------------------------------------------------
# CnpjNameSource: gatilho, lookup injetado, teto por-run
# ------------------------------------------------------------------

def test_source_pula_quando_lead_ja_tem_cnpj():
    called = {"n": 0}

    def lookup(nome, city, uf):
        called["n"] += 1
        return [_cand(phone="44 99999-0000")]

    src = CnpjNameSource(lookup=lookup)
    out = src.enrich(_lead(cnpj="99.888.777/0001-66"))
    assert out == []
    assert called["n"] == 0  # nem chama o lookup


def test_source_pula_sem_cidade():
    src = CnpjNameSource(lookup=lambda *a: [_cand()])
    assert src.enrich(_lead(city=None)) == []


def test_source_emite_cnpj_validado():
    src = CnpjNameSource(lookup=lambda *a: [_cand(phone="44 99999-0000")])
    out = src.enrich(_lead())
    f = next(x for x in out if x.field_name == "cnpj")
    assert f.value == "11222333000144"
    assert f.source == "cnpj_lookup"


def test_source_pula_quando_ambiguo():
    cands = [_cand(cnpj="11.222.333/0001-44", phone="44 99999-0000"),
             _cand(cnpj="55.666.777/0001-88", phone="44 99999-0000")]
    src = CnpjNameSource(lookup=lambda *a: cands)
    assert src.enrich(_lead()) == []


def test_source_lookup_que_explode_nao_derruba():
    def boom(*a):
        raise RuntimeError("agregador caiu")

    src = CnpjNameSource(lookup=boom)
    assert src.enrich(_lead()) == []


def test_source_respeita_teto_por_run():
    calls = {"n": 0}

    def lookup(*a):
        calls["n"] += 1
        return []

    src = CnpjNameSource(lookup=lookup, request_limit=2)
    src.enrich(_lead())
    src.enrich(_lead())
    src.enrich(_lead())  # 3a barrada
    assert calls["n"] == 2
