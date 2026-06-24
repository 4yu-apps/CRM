from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import THRESHOLD, score_lead


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", phone="44999990000", rating=4.6, reviews_count=300)
    base.update(kw)
    return Lead(**base)


def test_default_sem_anuncio_puxa_ambos():
    # #2: sem profissao definida (oferta trafego+automacao) e nao anuncia =>
    # a maioria dos leads serve pros dois => alvo "ambos".
    r = score_lead(_lead(reviews_count=150, website=None, instagram=None), {"ads_active": False})
    assert r.decision == "qualificado"
    assert r.service_target == "ambos"
    assert r.score >= THRESHOLD


# ------------------------------------------------------------------
# #2: classificacao trafego/automacao mais inteligente
# ------------------------------------------------------------------

def test_oferta_ambos_vira_automacao_quando_anuncia():
    # ja anuncia => a lacuna vira operacao/atendimento => automacao
    r = score_lead(
        _lead(reviews_count=400, category="Clínica odontológica", website="c.com"),
        {"ads_active": True},
        professions=["trafego", "automacao"],
    )
    assert r.service_target == "automacao"


def test_oferta_ambos_ads_desconhecido_puxa_ambos():
    # ads None ("nao sei" enquanto a API do FB nao liga) => ambos, nao trafego puro
    r = score_lead(_lead(website=None), {}, professions=["ambos"])
    assert r.service_target == "ambos"


def test_oferta_so_trafego_mantem_trafego():
    # agencia so faz trafego: alvo continua trafego (nao tem automacao pra ofertar)
    r = score_lead(_lead(website=None), {"ads_active": False}, professions=["trafego"])
    assert r.service_target == "trafego"


def test_oferta_so_automacao_mantem_automacao():
    r = score_lead(
        _lead(reviews_count=500, category="Clínica odontológica"),
        {"ads_active": False},
        professions=["automacao"],
    )
    assert r.service_target == "automacao"


def test_multi_profissao_qualifica_pelo_melhor_lens():
    # agencia faz trafego E design; lead sem site (mina pra design) qualifica
    r = score_lead(
        _lead(website=None, rating=4.6, reviews_count=200),
        {},
        professions=["trafego", "design"],
    )
    assert r.decision == "qualificado"


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


# ------------------------------------------------------------------
# lente marketing: instagram_status influencia o score
# ------------------------------------------------------------------

def test_marketing_sem_instagram_pontua_mais_alto_que_ativo():
    # sem Instagram (22 pts) > ativo (6 pts): oportunidade maior sem presenca
    sem = score_lead(_lead(instagram=None), profession="marketing").reason["marketing"]["score"]
    ativo = score_lead(
        _lead(instagram="@conta"),
        {"instagram_status": "ativo"},
        profession="marketing",
    ).reason["marketing"]["score"]
    assert sem > ativo


def test_marketing_parado_pontua_mais_alto_que_ativo():
    # parado (18 pts) > ativo (6 pts): da pra assumir a gestao
    parado = score_lead(
        _lead(instagram="@conta"),
        {"instagram_status": "parado"},
        profession="marketing",
    ).reason["marketing"]["score"]
    ativo = score_lead(
        _lead(instagram="@conta"),
        {"instagram_status": "ativo"},
        profession="marketing",
    ).reason["marketing"]["score"]
    assert parado > ativo


def test_marketing_sem_instagram_score_22_no_item():
    # sem Instagram => item Instagram vale 22 pts
    r = score_lead(_lead(instagram=None), profession="marketing")
    crit = r.reason["marketing"]["criteria"]
    ig_item = next(c for c in crit if c["label"] == "Instagram")
    assert ig_item["points"] == 22


def test_marketing_summary_com_instagram_parado_menciona_parado():
    r = score_lead(
        _lead(instagram="@conta"),
        {"instagram_status": "parado"},
        profession="marketing",
    )
    assert "parado" in r.reason["summary"].lower()


def test_marketing_summary_sem_travessao():
    r = score_lead(_lead(instagram=None), profession="marketing")
    assert "—" not in r.reason["summary"]
    assert "--" not in r.reason["summary"]
