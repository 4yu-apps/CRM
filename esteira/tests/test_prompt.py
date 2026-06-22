"""Testa build_prompt: diagnóstico do analista, ângulos condicionais e âncora."""
from garimpo_esteira.draft.prompt import build_prompt
from garimpo_esteira.models import Lead


def _lead(**kw) -> Lead:
    base = dict(id="l", owner_id="o", business_name="Barbearia do Ze", city="Maringa",
                rating=4.5, reviews_count=120, phone="44999990001")
    base.update(kw)
    return Lead(**base)


def test_score_reason_summary_aparece_no_prompt():
    lead = _lead(score_reason={"summary": "Trafego e o melhor alvo. X tem boa reputacao, sem site."})
    p = build_prompt(lead)
    assert "Trafego e o melhor alvo. X tem boa reputacao, sem site." in p


def test_sem_score_reason_nao_quebra():
    lead = _lead(score_reason=None)
    p = build_prompt(lead)
    assert isinstance(p, str) and len(p) > 0
    assert "Barbearia do Ze" in p
    assert "Diagnostico" not in p


def test_angulo_1_ads_sem_site():
    # ads_active=True mas sem site => menciona "escapar" ou "reter"
    lead = _lead(ads_active=True, website=None)
    p = build_prompt(lead)
    assert "escapar" in p or "reter" in p


def test_angulo_2_base_fiel():
    # nota >= 4.5, avaliacoes >= 150, sem site e sem instagram => "base fiel" ou "rechamar"
    lead = _lead(rating=4.7, reviews_count=200, website=None, instagram=None)
    p = build_prompt(lead)
    assert "base fiel" in p or "rechamar" in p


def test_angulo_2_base_fiel_sem_instagram_mas_com_site():
    # nota >= 4.5, avaliacoes >= 150, tem site mas sem instagram => ainda dispara
    lead = _lead(rating=4.7, reviews_count=200, website="https://ze.com.br", instagram=None)
    p = build_prompt(lead)
    assert "base fiel" in p or "rechamar" in p


def test_ancora_sempre_presente():
    p = build_prompt(_lead())
    assert "ncora obrigat" in p  # cobre "Âncora obrigatória"


def test_prompt_contem_nome_do_negocio():
    p = build_prompt(_lead(business_name="Salao da Marta"))
    assert "Salao da Marta" in p
    assert len(p) > 0


def test_angulo_1_nao_dispara_sem_ads():
    # ads_active=False (ou None) nao deve adicionar o sinal do anuncio-sem-site
    lead = _lead(ads_active=False, website=None)
    p = build_prompt(lead)
    assert "paga pra trazer" not in p


def test_angulo_2_nao_dispara_com_nota_baixa():
    # nota 4.2 < 4.5, nao deve disparar o angulo de base fiel
    lead = _lead(rating=4.2, reviews_count=200, website=None, instagram=None)
    p = build_prompt(lead)
    assert "base fiel" not in p


def test_angulo_2_nao_dispara_com_poucas_avaliacoes():
    # avaliacoes 100 < 150, nao deve disparar mesmo com nota alta
    lead = _lead(rating=4.8, reviews_count=100, website=None, instagram=None)
    p = build_prompt(lead)
    assert "base fiel" not in p


def test_review_themes_elogio_aparece_nos_sinais():
    lead = _lead()
    setattr(lead, "review_themes", {"elogio": "a borda da pizza", "reclamacao": "", "resumo": "ok"})
    p = build_prompt(lead)
    # o sinal de elogio entra com o conteudo real (ancora pra copy)
    assert "os clientes elogiam a borda da pizza" in p


def test_review_themes_sem_elogio_nao_adiciona_sinal():
    lead = _lead()
    setattr(lead, "review_themes", {"elogio": "", "reclamacao": "fila", "resumo": "ok"})
    p = build_prompt(lead)
    # sem elogio, o sinal de elogio nao entra (a frase fixa da ancora nao conta)
    assert "os clientes elogiam" not in p
