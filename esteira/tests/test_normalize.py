from garimpo_esteira.normalize import (
    dedup_key,
    normalize_cnpj,
    normalize_instagram,
    normalize_phone,
    only_digits,
)


def test_only_digits():
    assert only_digits("(44) 99999-0002") == "44999990002"
    assert only_digits(None) == ""


def test_normalize_cnpj():
    assert normalize_cnpj("11.222.333/0001-44") == "11222333000144"
    assert normalize_cnpj("123") is None
    assert normalize_cnpj(None) is None


def test_normalize_phone():
    assert normalize_phone("(44) 99999-0002") == "44999990002"
    assert normalize_phone("+55 44 3333-0003") == "4433330003"
    assert normalize_phone("99") is None


def test_normalize_phone_rejeita_eua():
    # Telefone EUA (DDD 40 nao existe no Brasil) deve virar None
    assert normalize_phone("4086482555") is None


def test_normalize_phone_celular_sp():
    assert normalize_phone("(11) 99999-0001") == "11999990001"


def test_normalize_phone_fixo_maringa():
    assert normalize_phone("(44) 3025-1234") == "4430251234"


def test_normalize_phone_ddd_invalido_vira_none():
    # DDD 40 nao existe
    assert normalize_phone("40999990001") is None


def test_normalize_instagram():
    assert normalize_instagram("instagram.com/studiobella") == "@studiobella"
    assert normalize_instagram("@StudioBella") == "@StudioBella"
    assert normalize_instagram(None) is None


def test_dedup_key_prioritizes_cnpj():
    assert dedup_key("11.222.333/0001-44", "44999990002") == "cnpj:11222333000144"
    assert dedup_key(None, "(44) 99999-0002") == "phone:44999990002"
    assert dedup_key(None, None) is None
