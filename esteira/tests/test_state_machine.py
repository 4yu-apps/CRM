from garimpo_esteira.state_machine import can_transition


def test_valid_transition():
    assert can_transition("bruto", "enriquecido")
    assert can_transition("enviado", "respondeu")


def test_invalid_transition():
    assert not can_transition("enriquecido", "enviado")
    assert not can_transition("bruto", "fechado")


def test_terminal_has_no_exit():
    assert not can_transition("fechado", "proposta")


def test_lgpd_guard_blocks_contact():
    assert not can_transition("qualificado", "rascunho_pronto", opt_out=True)
    assert not can_transition("aprovado", "enviado", opt_out=True)
    # enriquecimento/descarte não é contato -> permitido mesmo com opt-out
    assert can_transition("bruto", "enriquecido", opt_out=True)
