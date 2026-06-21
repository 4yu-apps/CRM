"""Testes do parser de endereco do Maps (bairro, cidade, UF)."""
from garimpo_esteira.discovery import parse_address


def test_endereco_completo_sp():
    nb, city, uf = parse_address("Av. Nove de Julho, 3384 - Jardim Paulista, São Paulo - SP, 01406-000, Brasil")
    assert nb == "Jardim Paulista"
    assert city == "São Paulo"
    assert uf == "SP"


def test_endereco_maringa():
    nb, city, uf = parse_address("R. Néo Alves Martins, 3221 - Zona 01, Maringá - PR, 87013-060, Brasil")
    assert nb == "Zona 01"
    assert city == "Maringá"
    assert uf == "PR"


def test_sem_bairro():
    nb, city, uf = parse_address("Maringá - PR, 87000-000, Brasil")
    assert city == "Maringá"
    assert uf == "PR"
    assert nb is None


def test_endereco_vazio():
    assert parse_address(None) == (None, None, None)
    assert parse_address("") == (None, None, None)


def test_nao_inventa_uf_de_lixo():
    nb, city, uf = parse_address("Rua Sem Padrao 123")
    assert uf is None
    assert city is None
