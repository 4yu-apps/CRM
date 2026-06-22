"""Testes da trava Brasil (geo.py)."""
import pytest

from garimpo_esteira.geo import is_br_phone, is_br_uf, looks_foreign


# ---- is_br_phone ----

class TestIsBrPhone:
    def test_celular_sp_valido(self):
        assert is_br_phone("(11) 99999-0001") is True

    def test_celular_sp_sem_formatacao(self):
        assert is_br_phone("11999990001") is True

    def test_fixo_maringa_valido(self):
        assert is_br_phone("(44) 3025-1234") is True

    def test_fixo_sem_formatacao(self):
        assert is_br_phone("4430251234") is True

    def test_com_ddi_55_movel(self):
        assert is_br_phone("+55 11 99999-0001") is True

    def test_com_ddi_55_fixo(self):
        assert is_br_phone("+55 44 3025-1234") is True

    def test_telefone_eua_ddd_invalido(self):
        # 4086482555 - DDD 40 nao existe no Brasil
        assert is_br_phone("4086482555") is False

    def test_ddd_40_invalido(self):
        assert is_br_phone("40999990001") is False

    def test_comprimento_errado_curto(self):
        assert is_br_phone("99") is False

    def test_comprimento_errado_longo(self):
        assert is_br_phone("1199999000111") is False

    def test_none_retorna_false(self):
        assert is_br_phone(None) is False

    def test_vazio_retorna_false(self):
        assert is_br_phone("") is False

    def test_celular_terceiro_digito_errado(self):
        # Celular deve ter 3o digito = 9; aqui e 8 (formato antigo que nao existe mais)
        assert is_br_phone("11899990001") is False

    def test_fixo_terceiro_digito_errado(self):
        # Fixo deve ter 3o digito em 2-5; aqui e 9 (nao pode ser fixo)
        assert is_br_phone("4496251234") is False

    def test_celular_pr_valido(self):
        assert is_br_phone("(44) 99888-2000") is True

    def test_ddd_brasilia(self):
        assert is_br_phone("61999880001") is True

    def test_ddd_manaus(self):
        assert is_br_phone("92999880001") is True


# ---- is_br_uf ----

class TestIsBrUf:
    def test_sp_valido(self):
        assert is_br_uf("SP") is True

    def test_pr_valido(self):
        assert is_br_uf("PR") is True

    def test_rj_valido(self):
        assert is_br_uf("RJ") is True

    def test_california_invalido(self):
        assert is_br_uf("CA") is False

    def test_ny_invalido(self):
        assert is_br_uf("NY") is False

    def test_none_retorna_false(self):
        assert is_br_uf(None) is False

    def test_vazio_retorna_false(self):
        assert is_br_uf("") is False

    def test_minusculo_aceita(self):
        # Normaliza para maiusculo
        assert is_br_uf("sp") is True

    def test_com_espaco_aceita(self):
        assert is_br_uf(" SP ") is True

    def test_uf_inventada(self):
        assert is_br_uf("XX") is False


# ---- looks_foreign ----

class TestLooksForeign:
    def test_state_estrangeiro(self):
        assert looks_foreign("CA", None) is True

    def test_state_br_nao_e_estrangeiro(self):
        assert looks_foreign("PR", None) is False

    def test_state_sp_nao_e_estrangeiro(self):
        assert looks_foreign("SP", "Av. Paulista, 1000 - Bela Vista, Sao Paulo - SP, Brasil") is False

    def test_endereco_com_eua(self):
        assert looks_foreign(None, "Cinta Aveda Institute, San Francisco, CA, EUA") is True

    def test_endereco_com_united_states(self):
        assert looks_foreign(None, "1 Market St, San Francisco, California, United States") is True

    def test_endereco_maringa_br_nao_e_estrangeiro(self):
        assert looks_foreign("PR", "R. Neo Alves Martins, 3221, Maringa - PR, Brasil") is False

    def test_ambos_vazios_nao_e_estrangeiro(self):
        assert looks_foreign(None, None) is False

    def test_ambos_vazio_string_nao_e_estrangeiro(self):
        assert looks_foreign("", "") is False

    def test_endereco_com_usa(self):
        assert looks_foreign(None, "456 Main Street, Miami, USA") is True

    def test_rua_com_nome_de_pais_nao_e_estrangeiro(self):
        # rua/avenida BR com nome de pais NAO e criterio: a UF valida manda.
        # (regressao: "Av. Republica Argentina" e "Rua Estados Unidos" sao BR)
        assert looks_foreign("PR", "Av. Rep. Argentina, 1228 - Agua Verde, Curitiba - PR, Brasil") is False
        assert looks_foreign("SP", "Rua: Estados Unidos, 256 - Jardins, Sao Paulo - SP, Brasil") is False

    def test_us_zip_sem_state_e_estrangeiro(self):
        # endereco US com CEP americano (UF + espaco + 5 digitos) e sem UF BR
        assert looks_foreign(None, "595 E Taylor St, San Jose, CA 95112") is True

    def test_state_vazio_endereco_br(self):
        # State vazio: nao marca como estrangeiro
        assert looks_foreign("", "Rua das Flores, 100, Curitiba - PR") is False

    def test_state_none_endereco_br(self):
        assert looks_foreign(None, "Rua das Flores, 100, Curitiba - PR") is False

    def test_state_estrangeiro_mesmo_sem_endereco(self):
        assert looks_foreign("TX", None) is True

    def test_endereco_portugal(self):
        assert looks_foreign(None, "Av. da Liberdade, 100, Lisboa, Portugal") is True

    def test_estado_none_so_endereco_vazio(self):
        assert looks_foreign(None, "   ") is False
