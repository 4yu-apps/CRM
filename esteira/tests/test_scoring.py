from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import THRESHOLD, score_lead


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", phone="44999990000", rating=4.6, reviews_count=300)
    base.update(kw)
    return Lead(**base)


def test_strong_icp_lead_qualifies():
    r = score_lead(_lead(website=None, instagram=None))
    assert r.decision == "qualificado"
    assert r.score >= THRESHOLD
    assert r.reason["total"] == r.score
    assert any("site" in c["note"] for c in r.reason["criteria"])


def test_weak_lead_is_discarded():
    r = score_lead(_lead(rating=3.5, reviews_count=10))
    assert r.decision == "descartado"
    assert r.score < THRESHOLD


def test_no_phone_is_hard_discard():
    r = score_lead(_lead(phone=None, rating=4.9, reviews_count=300, website=None, instagram=None))
    assert r.decision == "descartado"
    assert "telefone" in r.reason["verdict"]


def test_digital_neglect_scores_higher_than_present():
    without_site = score_lead(_lead(website=None)).score
    with_site = score_lead(_lead(website="x.com")).score
    assert without_site > with_site


def test_not_advertising_scores_higher():
    nao = score_lead(_lead(website=None), {"ads_active": False}).score
    sim = score_lead(_lead(website=None), {"ads_active": True}).score
    assert nao > sim


def test_reason_is_explainable():
    r = score_lead(_lead())
    assert {"total", "threshold", "decision", "verdict", "criteria"} <= r.reason.keys()
    assert all({"label", "points", "note"} <= c.keys() for c in r.reason["criteria"])
