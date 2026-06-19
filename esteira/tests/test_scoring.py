from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import THRESHOLD, score_lead


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", phone="44999990000", rating=4.6, reviews_count=300)
    base.update(kw)
    return Lead(**base)


def test_trafego_lead_qualifies_and_targets_trafego():
    # nota boa, volume ok, sem site, nao anuncia => alvo tráfego
    r = score_lead(_lead(reviews_count=150, website=None, instagram=None), {"ads_active": False})
    assert r.decision == "qualificado"
    assert r.service_target == "trafego"
    assert r.score >= THRESHOLD


def test_automacao_lead_targets_automacao():
    # muito volume + categoria de agendamento, mas ja tem site e anuncia
    # => o sinal de tráfego cai e sobra automação
    r = score_lead(
        _lead(reviews_count=900, rating=4.5, category="Clínica odontológica",
              website="clinica.com", instagram="insta"),
        {"ads_active": True},
    )
    assert r.decision == "qualificado"
    assert r.service_target == "automacao"


def test_strong_both_targets_ambos():
    # movimento pra anunciar e volume + agendamento pra automatizar
    r = score_lead(
        _lead(reviews_count=500, rating=4.7, category="Clínica odontológica",
              website=None, instagram=None),
        {"ads_active": False},
    )
    assert r.service_target == "ambos"


def test_no_phone_is_hard_discard():
    r = score_lead(_lead(phone=None, rating=4.9, reviews_count=300, website=None, instagram=None))
    assert r.decision == "descartado"
    assert r.service_target == "indefinido"
    assert "telefone" in r.reason["verdict"]


def test_weak_lead_is_discarded():
    r = score_lead(_lead(rating=3.4, reviews_count=8, website="x.com", instagram="x"), {"ads_active": True})
    assert r.decision == "descartado"
    assert r.score < THRESHOLD
    assert r.service_target == "indefinido"


def test_reason_has_summary_and_both_icps():
    r = score_lead(_lead(website=None), {"ads_active": False})
    keys = {"total", "threshold", "decision", "verdict", "criteria",
            "summary", "service_target", "trafego", "automacao"}
    assert keys <= r.reason.keys()
    assert r.reason["total"] == r.score
    assert r.reason["summary"]                       # motivo em PT
    assert "—" not in r.reason["summary"]            # sem travessao
    assert "--" not in r.reason["summary"]
    assert {"score", "criteria"} <= r.reason["trafego"].keys()
    assert {"score", "criteria"} <= r.reason["automacao"].keys()
    assert all({"label", "points", "note"} <= c.keys() for c in r.reason["criteria"])


def test_not_advertising_scores_higher_for_trafego():
    nao = score_lead(_lead(website=None), {"ads_active": False}).reason["trafego"]["score"]
    sim = score_lead(_lead(website=None), {"ads_active": True}).reason["trafego"]["score"]
    assert nao > sim


def test_digital_neglect_scores_higher_for_trafego():
    without = score_lead(_lead(website=None)).reason["trafego"]["score"]
    with_site = score_lead(_lead(website="x.com")).reason["trafego"]["score"]
    assert without > with_site
