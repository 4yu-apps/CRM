from garimpo_esteira.match_rate import filled_fields, match_rate
from garimpo_esteira.models import Lead


def test_match_rate_counts_present_targets():
    lead = Lead(id="l", owner_id="o", phone="44999990002", owner_name="Marina",
                instagram="@x", website=None)
    # 3 de 4 alvos (phone, owner_name, instagram) -> 0.75
    assert match_rate(lead) == 0.75


def test_match_rate_zero_when_empty():
    assert match_rate(Lead(id="l", owner_id="o")) == 0.0


def test_filled_fields_lists_real_content():
    lead = Lead(id="l", owner_id="o", phone="44999990002", email="(ausente)")
    assert "phone" in filled_fields(lead)
    assert "email" not in filled_fields(lead)
