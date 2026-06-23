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


def test_prompt_contem_lista_proibido():
    """SYSTEM_INSTRUCTION deve listar frases proibidas para orientar a IA."""
    from garimpo_esteira.draft.prompt import SYSTEM_INSTRUCTION
    assert "espero que" in SYSTEM_INSTRUCTION, "lista PROIBIDO deve incluir 'espero que esteja bem'"
    assert "revolucionar" in SYSTEM_INSTRUCTION, "lista PROIBIDO deve incluir 'revolucionar'"
    assert "alavancar" in SYSTEM_INSTRUCTION, "lista PROIBIDO deve incluir 'alavancar'"
    assert "prezado" in SYSTEM_INSTRUCTION, "lista PROIBIDO deve incluir 'prezado'"


def test_prompt_servico_trafego_food_menciona_ifood():
    """Brief de trafego para negocio de alimentacao deve orientar sobre iFood."""
    from garimpo_esteira.draft.prompt import _SERVICE_BRIEF
    brief = _SERVICE_BRIEF["trafego"]
    assert "iFood" in brief, "brief de trafego deve mencionar iFood como angulo para alimentacao"


# --- categoria (tag) dirige a pergunta da copy ---

def test_category_cue_alimentacao():
    from garimpo_esteira.draft.prompt import _category_cue
    assert "canal de venda" in _category_cue("Pizzaria")


def test_category_cue_barbearia_e_beleza_nao_alimentacao():
    # 'barbearia' contem 'bar' mas NAO pode cair em alimentacao
    from garimpo_esteira.draft.prompt import _category_cue
    assert "beleza" in _category_cue("Barbearia")


def test_category_cue_saude_tom_sobrio():
    from garimpo_esteira.draft.prompt import _category_cue
    assert "sobrio" in _category_cue("Clinica Odontologica")


def test_category_cue_desconhecida_vazia():
    from garimpo_esteira.draft.prompt import _category_cue
    assert _category_cue("Coisa Aleatoria XYZ") == ""


def test_build_prompt_inclui_cue_da_categoria():
    lead = _lead(category="Hamburgueria")
    p = build_prompt(lead)
    assert "Tipico da categoria:" in p


def test_profissao_dirige_brief_design():
    # service_target=design (derivado da profissao) -> brief de design no prompt
    lead = _lead(service_target="design", website=None)
    p = build_prompt(lead)
    assert "DESIGN / SITE" in p


def test_sinal_ja_anuncia_plataforma_aparece():
    lead = _lead(ads_active=True, website="https://x.com",
                 site_signals={"ad_platforms": ["meta", "google"]})
    p = build_prompt(lead)
    assert "ja investe em anuncio" in p
    assert "meta" in p and "google" in p


def test_sinal_site_lento_pagespeed():
    lead = _lead(website="https://x.com", site_signals={"perf_score": 22})
    p = build_prompt(lead)
    assert "site lento no celular" in p
