from datetime import date

from garimpo_esteira.models import Lead
from garimpo_esteira.scoring import THRESHOLD, is_mei, score_advocacia, score_lead

TODAY = date(2026, 6, 25)


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


def test_marketing_sem_instagram_presenca_vale_30():
    # sem Instagram => item Presenca (eixo do U) vale 30 pts: construir do zero
    r = score_lead(_lead(instagram=None), profession="marketing")
    crit = r.reason["marketing"]["criteria"]
    item = next(c for c in crit if c["label"] == "Presenca")
    assert item["points"] == 30


def test_marketing_presenca_forte_tambem_qualifica():
    # ICP em U: presenca forte (ativo + recorrente + audiencia) qualifica tanto
    # quanto a ausencia; o meio-termo morno (ativo sem ritmo) fica abaixo.
    forte = score_lead(
        _lead(instagram="@conta", reviews_count=200, phone="4499"),
        {"instagram_status": "ativo", "instagram_post_freq": "3",
         "instagram_followers": "12000", "instagram_engagement": "300"},
        profession="marketing",
    ).reason["marketing"]["score"]
    morno = score_lead(
        _lead(instagram="@conta", reviews_count=200, phone="4499"),
        {"instagram_status": "ativo", "instagram_post_freq": "0.2",
         "instagram_followers": "1000", "instagram_engagement": "20"},
        profession="marketing",
    ).reason["marketing"]["score"]
    assert forte > morno


def test_marketing_gmb_ausente_pontua_mais_que_completo():
    # sem Perfil de Empresa no Google = presenca incompleta (mais pontos que completo)
    sem_gmb = score_lead(
        _lead(instagram="@x", rating=None, reviews_count=0, maps_place_id=None),
        profession="marketing",
    )
    ausente = next(c for c in sem_gmb.reason["marketing"]["criteria"] if c["label"] == "Google")
    completo = score_lead(
        _lead(instagram="@x", rating=4.6, reviews_count=300, opening_hours="Seg 9-18",
              website="https://x.com"),
        profession="marketing",
    )
    ok = next(c for c in completo.reason["marketing"]["criteria"] if c["label"] == "Google")
    assert ausente["points"] == 12
    assert ok["points"] == 3


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


# ------------------------------------------------------------------
# O1 "negocio novo": idade da empresa (opened_on) pesa em trafego/design/marketing
# ------------------------------------------------------------------

def _crit(reason, lens, label):
    return next((c for c in reason[lens]["criteria"] if c["label"] == label), None)


def test_negocio_novo_pontua_forte_em_trafego():
    # aberto ha ~3.5 meses => faixa forte (18 pts)
    r = score_lead(_lead(website=None, opened_on="2026-03-01"), {"ads_active": False}, today=TODAY)
    assert _crit(r.reason, "trafego", "Idade")["points"] == 18


def test_negocio_recente_pontua_leve_em_trafego():
    # aberto ha ~12 meses => faixa leve (8 pts)
    r = score_lead(_lead(website=None, opened_on="2025-06-01"), {"ads_active": False}, today=TODAY)
    assert _crit(r.reason, "trafego", "Idade")["points"] == 8


def test_negocio_estabelecido_zera_idade():
    # aberto ha anos => 0 pts, mas aparece no breakdown (transparente)
    r = score_lead(_lead(website=None, opened_on="2022-01-01"), {"ads_active": False}, today=TODAY)
    assert _crit(r.reason, "trafego", "Idade")["points"] == 0


def test_sem_data_abertura_nao_cria_item_idade():
    r = score_lead(_lead(website=None), {"ads_active": False}, today=TODAY)
    assert _crit(r.reason, "trafego", "Idade") is None


def test_idade_entra_em_design_e_marketing():
    r = score_lead(_lead(website=None, opened_on="2026-03-01"), {}, today=TODAY)
    assert _crit(r.reason, "design", "Idade")["points"] == 18
    assert _crit(r.reason, "marketing", "Idade")["points"] == 18


def test_idade_nao_entra_em_automacao():
    r = score_lead(
        _lead(opened_on="2026-03-01", category="Clínica odontológica"), {}, today=TODAY
    )
    assert _crit(r.reason, "automacao", "Idade") is None


def test_negocio_novo_some_no_score_de_trafego():
    novo = score_lead(
        _lead(website=None, opened_on="2026-03-01"), {"ads_active": False}, today=TODAY
    ).reason["trafego"]["score"]
    velho = score_lead(
        _lead(website=None, opened_on="2010-01-01"), {"ads_active": False}, today=TODAY
    ).reason["trafego"]["score"]
    assert novo > velho


def test_idade_note_sem_travessao():
    r = score_lead(_lead(website=None, opened_on="2026-03-01"), {"ads_active": False}, today=TODAY)
    note = _crit(r.reason, "trafego", "Idade")["note"]
    assert "—" not in note and "--" not in note


# ------------------------------------------------------------------
# Fase 4: empresa baixada/inapta na Receita = corte duro (nao prospectar morto)
# ------------------------------------------------------------------

def test_empresa_baixada_e_descartada():
    r = score_lead(
        _lead(company_status="BAIXADA", rating=4.8, reviews_count=300, website=None),
        {"ads_active": False},
    )
    assert r.decision == "descartado"
    assert r.service_target == "indefinido"
    assert "baixada" in r.reason["verdict"].lower()


def test_empresa_inapta_e_descartada():
    r = score_lead(_lead(company_status="INAPTA", website=None), {"ads_active": False})
    assert r.decision == "descartado"


def test_empresa_ativa_nao_sofre_corte():
    r = score_lead(_lead(company_status="ATIVA", website=None), {"ads_active": False})
    assert r.decision == "qualificado"


def test_sem_company_status_nao_corta():
    r = score_lead(_lead(website=None), {"ads_active": False})
    assert r.decision == "qualificado"


# ------------------------------------------------------------------
# Fase 6: intensidade de anuncio no lens trafego (ads_count)
# ------------------------------------------------------------------

def test_anuncia_forte_pontua_menos_que_leve_no_trafego():
    forte = _crit(
        score_lead(_lead(website="x.com"), {"ads_active": True, "ads_count": 8}).reason,
        "trafego", "Anuncia?",
    )
    leve = _crit(
        score_lead(_lead(website="x.com"), {"ads_active": True, "ads_count": 1}).reason,
        "trafego", "Anuncia?",
    )
    assert forte["points"] < leve["points"]
    assert "8" in forte["note"]


# ------------------------------------------------------------------
# B6: engajamento do Instagram no lens marketing
# ------------------------------------------------------------------

def test_marketing_engajamento_baixo_pontua_mais_que_alto():
    baixo = _crit(
        score_lead(_lead(instagram="@x"),
                   {"instagram_followers": 10000, "instagram_engagement": 50.0},
                   profession="marketing").reason,
        "marketing", "Engajamento",
    )
    alto = _crit(
        score_lead(_lead(instagram="@x"),
                   {"instagram_followers": 1000, "instagram_engagement": 80.0},
                   profession="marketing").reason,
        "marketing", "Engajamento",
    )
    assert baixo is not None and alto is not None
    assert baixo["points"] > alto["points"]


def test_marketing_sem_engajamento_nao_cria_item():
    r = score_lead(_lead(instagram="@x"), profession="marketing")
    assert _crit(r.reason, "marketing", "Engajamento") is None


# ------------------------------------------------------------------
# Lente de advocacia: o ICP juridico. Nao olha Instagram, engajamento nem
# GMB; olha empresa (natureza juridica, socios, capital, situacao, idade,
# assessoria aparente).
# ------------------------------------------------------------------

def _adv(**kw) -> Lead:
    base = dict(
        id="l", owner_id="o", phone="44999990000", business_name="Empresa X",
        company_status="ATIVA",
        natureza_juridica="206-2 - Sociedade Empresaria Limitada",
        opened_on="2014-02-01", capital_social=200000.0, socios_count=3,
    )
    base.update(kw)
    return Lead(**base)


def test_mei_e_cortado_da_lente_de_advocacia():
    mei = _adv(natureza_juridica="213-5 - Empresario (Individual)", porte="MEI")
    assert is_mei(mei) is True
    r = score_lead(mei, {"site": {"mei": True}}, professions=["advocacia"], today=TODAY)
    assert r.decision == "descartado"


def test_ltda_com_socios_e_idade_qualifica():
    r = score_lead(_adv(), {"site": {}}, professions=["advocacia"], today=TODAY)
    assert r.decision == "qualificado"
    assert r.service_target == "advocacia"


def test_idade_juridica_em_u_reprova_o_meio_termo():
    nova, _ = score_advocacia(_adv(opened_on="2025-06-01"), {}, TODAY)
    meio, _ = score_advocacia(_adv(opened_on="2023-01-01"), {}, TODAY)
    madura, _ = score_advocacia(_adv(opened_on="2014-02-01"), {}, TODAY)
    assert nova > meio
    assert madura > meio


def test_sem_politica_de_privacidade_pontua_mais():
    com, _ = score_advocacia(
        _adv(website="https://x.com"),
        {"site": {"has_privacy_policy": True, "has_terms": True}}, TODAY)
    sem, _ = score_advocacia(
        _adv(website="https://x.com"),
        {"site": {"has_privacy_policy": False, "has_terms": False}}, TODAY)
    assert sem > com


def test_empresa_irregular_qualifica_pra_advogado():
    r = score_lead(_adv(company_status="INAPTA"), {"site": {}},
                   professions=["advocacia"], today=TODAY)
    assert r.decision == "qualificado"


def test_regressao_empresa_irregular_continua_cortada_fora_da_advocacia():
    inapta = _adv(company_status="INAPTA", rating=4.8, reviews_count=300,
                  website="https://x.com")
    for profs in (["trafego"], ["marketing"], ["design"], ["automacao"], []):
        r = score_lead(inapta, {"site": {}}, professions=profs, today=TODAY)
        assert r.decision == "descartado", profs


def test_advocacia_ignora_instagram_e_anuncio():
    ruido = {"instagram_followers": 50000, "instagram_status": "ativo",
             "instagram_post_freq": 4.0, "ads_active": True}
    com_ruido, _ = score_advocacia(_adv(instagram="@x", facebook="fb.com/x"), ruido, TODAY)
    sem_ruido, _ = score_advocacia(_adv(), {}, TODAY)
    assert com_ruido == sem_ruido


def test_legal_area_pesa_o_criterio_que_importa():
    lead = _adv(category="transportadora")
    neutro, crit_n = score_advocacia(lead, {}, TODAY)
    trab, crit_t = score_advocacia(lead, {}, TODAY, ["trabalhista"])
    risco_n = next(c["points"] for c in crit_n if c["label"] == "Risco do ramo")
    risco_t = next(c["points"] for c in crit_t if c["label"] == "Risco do ramo")
    assert risco_t > risco_n
    assert trab > neutro


def test_reason_traz_a_lente_de_advocacia():
    r = score_lead(_adv(), {"site": {}}, professions=["advocacia"], today=TODAY)
    assert "advocacia" in r.reason
    assert r.reason["lens"] == "advocacia"
    assert "advocacia" in r.reason["summary"].lower()


# ------------------------------------------------------------------
# Canal de contato na advocacia: o e-mail formal e um SEGUNDO canal
# desenhado pra area (endereco vem da Receita). Empresa boa sem
# telefone era descartada com score alto — perda pura.
# ------------------------------------------------------------------

def _empresa_forte(**kw) -> Lead:
    """Sociedade com socios, capital e tempo de casa: pontua alto na lente."""
    base = dict(
        id="e", owner_id="o", business_name="Metalurgica Kranz",
        category="Industria metalurgica", city="Cambe", state="PR",
        natureza_juridica="206-2 - Sociedade Empresaria Limitada",
        socios_count=4, capital_social=1_500_000.0, porte="DEMAIS",
        company_status="ATIVA", opened_on="2009-05-12",
    )
    base.update(kw)
    return Lead(**base)


def test_advocacia_qualifica_lead_so_com_email():
    lead = _empresa_forte(phone=None, email="comercial@kranz.ind.br")
    r = score_lead(lead, {"simples": False}, professions=["advocacia"])
    assert r.decision == "qualificado", r.reason["verdict"]
    assert r.service_target == "advocacia"


def test_advocacia_descarta_sem_telefone_e_sem_email():
    lead = _empresa_forte(phone=None, email=None)
    r = score_lead(lead, {"simples": False}, professions=["advocacia"])
    assert r.decision == "descartado"
    assert "e-mail" in r.reason["verdict"]


def test_regressao_outras_areas_continuam_exigindo_telefone():
    """So a advocacia tem o segundo canal. Marketing/trafego/design abordam por
    WhatsApp, entao lead sem telefone segue inalcancavel pra eles."""
    for prof in ("trafego", "marketing", "design"):
        lead = _empresa_forte(
            id=f"e-{prof}", phone=None, email="comercial@kranz.ind.br",
            rating=4.8, reviews_count=300, website=None, instagram=None,
        )
        r = score_lead(lead, {}, professions=[prof])
        assert r.decision == "descartado", prof
        assert r.reason["verdict"] == "sem telefone, nao da pra contatar no WhatsApp", prof


def test_telefone_pontua_mais_que_email_na_advocacia():
    so_email = score_lead(
        _empresa_forte(phone=None, email="a@b.com.br"), {}, professions=["advocacia"])
    so_fone = score_lead(
        _empresa_forte(phone="43998887766", email=None), {}, professions=["advocacia"])
    os_dois = score_lead(
        _empresa_forte(phone="43998887766", email="a@b.com.br"), {}, professions=["advocacia"])
    assert so_email.score < so_fone.score < os_dois.score


def test_resumo_do_mei_nao_se_contradiz():
    """MEI e corte duro (score 0); o resumo na fila nao pode dizer que o lead
    'sustenta assessoria juridica'."""
    mei = Lead(
        id="m", owner_id="o", business_name="Cantina da Nona", category="Restaurante",
        phone="4333445566", natureza_juridica="213-5 - Empresario (Individual)",
        porte="MEI", socios_count=1, company_status="ATIVA", opened_on="2021-06-15",
    )
    r = score_lead(mei, {"simples": True}, professions=["advocacia"])
    assert r.decision == "descartado"
    resumo = r.reason["summary"]
    assert "MEI" in resumo
    assert "Bom pra advocacia" not in resumo
    assert "Perfil de empresa que sustenta" not in resumo


def test_area_consultiva_pesa_natureza_e_idade():
    """Sub-pesos proprios: contrato social (natureza) e o momento da empresa
    (nova constitui, madura acumula obrigacao) pesam mais que o resto."""
    lead = _empresa_forte(phone="43998887766")
    com = score_lead(lead, {"simples": False}, professions=["advocacia"],
                     legal_areas=["consultivo"])
    sem = score_lead(lead, {"simples": False}, professions=["advocacia"])
    assert com.score > sem.score

    crit = {c["label"]: c["points"] for c in com.reason["advocacia"]["criteria"]}
    base = {c["label"]: c["points"] for c in sem.reason["advocacia"]["criteria"]}
    assert crit["Natureza"] > base["Natureza"]
    assert crit["Idade"] > base["Idade"]
