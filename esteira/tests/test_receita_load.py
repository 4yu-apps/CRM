"""Testes dos transformadores puros do loader da Receita (Fase 5.5b).

O download/streaming dos ~15GB de zips e operacao do dono (fora do cron); aqui
testamos so o parsing/normalizacao linha-a-linha, que e o que pode quebrar dado.
"""
from garimpo_esteira.receita_load import (
    map_situacao,
    parse_estabelecimento,
    parse_municipios,
)

# linha real-ish do ESTABELECIMENTOS (30 campos, ;-sep, aspas). ATIVA=02.
_LINHA = ('"11222333";"0001";"44";"1";"CORTE FINO";"02";"20210510";"00";"";"";'
          '"20210510";"9602501";"";"RUA";"DAS FLORES";"100";"";"ZONA 7";"87000000";'
          '"PR";"7149";"44";"999990000";"";"";"";"";"contato@x.com";"";""')


def test_map_situacao():
    assert map_situacao("02") == "ATIVA"
    assert map_situacao("08") == "BAIXADA"
    assert map_situacao("04") == "INAPTA"
    assert map_situacao("99") is None


def test_parse_estabelecimento_campos():
    r = parse_estabelecimento(_LINHA)
    assert r["cnpj"] == "11222333000144"
    assert r["nome_fantasia"] == "CORTE FINO"
    assert r["situacao"] == "ATIVA"
    assert r["data_inicio"] == "2021-05-10"
    assert r["cnae"] == "9602501"
    assert r["logradouro"] == "RUA DAS FLORES"
    assert r["numero"] == "100"
    assert r["bairro"] == "ZONA 7"
    assert r["uf"] == "PR"
    assert r["municipio_code"] == "7149"
    assert r["telefone"] == "44999990000"
    assert r["email"] == "contato@x.com"


def test_parse_estabelecimento_cnpj_invalido_vira_none():
    ruim = '"11";"0001";"44";"1";"X";"02";"";"";"";"";"";"";"";"";"";"";"";"";"";"PR";"7149";"";"";"";"";"";"";"";"";""'
    assert parse_estabelecimento(ruim) is None


def test_parse_estabelecimento_sem_telefone():
    sem_tel = ('"11222333";"0001";"44";"1";"X";"02";"";"";"";"";"";"";"";"";"";"";"";"";"";'
               '"PR";"7149";"";"";"";"";"";"";"";"";""')
    assert parse_estabelecimento(sem_tel)["telefone"] is None


def test_parse_municipios():
    linhas = ['"7149";"MARINGA"', '"9999";"SAO PAULO"']
    m = parse_municipios(linhas)
    assert m["7149"] == "MARINGA"
    assert m["9999"] == "SAO PAULO"
