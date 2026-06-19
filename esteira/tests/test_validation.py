from garimpo_esteira.validation import clean, is_present


def test_is_present_rejects_placeholders():
    assert not is_present("phone", "(ausente)")
    assert not is_present("website", "—")
    assert not is_present("email", "")


def test_is_present_validates_content_not_status():
    # parece preenchido, mas não é telefone válido -> ausente
    assert not is_present("phone", "abc")
    assert is_present("phone", "(44) 99999-0002")
    assert is_present("email", "x@y.com")
    assert not is_present("email", "semarroba")


def test_clean_normalizes():
    assert clean("phone", "(44) 99999-0002") == "44999990002"
    assert clean("cnpj", "11.222.333/0001-44") == "11222333000144"
    assert clean("instagram", "instagram.com/x") == "@x"
    assert clean("website", "  ") is None
