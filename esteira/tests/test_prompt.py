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
    # ads_active=True mas sem site => menciona "escapar" ou "reter".
    # So vale pra quem VENDE site (design); trafego/automacao nao falam de site.
    lead = _lead(ads_active=True, website=None, service_target="design")
    p = build_prompt(lead)
    assert "escapar" in p or "reter" in p


def _mkt_lead(**kw) -> Lead:
    lead = _lead(**kw)
    setattr(lead, "profession", "marketing")  # a profissao e injetada no draft_stage
    return lead


def test_marketing_angulo_construir_quando_ig_parado():
    lead = _mkt_lead(instagram="@conta", social_signals={"ig_status": "parado"})
    p = build_prompt(lead)
    assert "CONSTRUIR" in p
    assert "ESCALAR" not in p


def test_marketing_angulo_escalar_quando_presenca_forte():
    lead = _mkt_lead(instagram="@conta",
                     social_signals={"ig_status": "ativo", "post_freq": 3, "followers": 8000,
                                     "engagement_rate": 3.2})
    p = build_prompt(lead)
    assert "ESCALAR" in p
    # sinais de mkt entram como contexto pro modelo
    assert "seguidores" in p.lower()


def test_marketing_nunca_sugere_criar_site():
    lead = _mkt_lead(website=None, instagram="@conta", social_signals={"ig_status": "parado"})
    p = build_prompt(lead)
    assert "oportunidade de criar a presenca" not in p
    assert "da pra modernizar" not in p


def test_trafego_nao_sugere_site():
    # Regra do dono: trafego/automacao NUNCA comentam falta de site nem citam
    # WordPress/Wix nos sinais (so design/web vendem site). Checa as frases que
    # SO aparecem quando um sinal de site entra (o texto fixo da instrucao cita
    # "site" como exemplo de fato, por isso checamos frases especificas).
    lead = _lead(service_target="trafego", website=None, ads_active=True,
                 site_signals={"perf_score": 20, "stack": "wordpress"})
    p = build_prompt(lead)
    assert "oportunidade de criar a presenca" not in p
    assert "da pra modernizar" not in p
    assert "site lento no celular" not in p
    assert "nao tem site pra reter" not in p
    assert "wordpress" not in p
    assert "PROIBIDO falar de site" in p


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
    # Sinal de site so entra pra quem vende site (design/web).
    lead = _lead(website="https://x.com", site_signals={"perf_score": 22},
                 service_target="design")
    p = build_prompt(lead)
    assert "site lento no celular" in p


def test_prompt_alimenta_instagram_parado():
    lead = _lead(
        instagram="@x",
        service_target="marketing",
        social_signals={"ig_status": "parado"},
    )
    assert "Instagram parado" in build_prompt(lead)


def test_prompt_intensidade_ads_so_em_trafego_ou_ambos():
    social = {"ads_active": True, "ads_count": 8, "ads_since": "2025-01-01"}
    trafego = _lead(
        ads_active=True, website="https://x.com",
        service_target="trafego", social_signals=social,
    )
    assert "8 anuncios ativos" in build_prompt(trafego)

    design = _lead(
        ads_active=True, website="https://x.com",
        service_target="design", social_signals=social,
    )
    assert "8 anuncios ativos" not in build_prompt(design)


def test_prompt_nao_usa_owner_name():
    prompt = build_prompt(_lead(owner_name="Pessoa Sensivel"))
    assert "Pessoa Sensivel" not in prompt


# --- voz humana com auto-apresentacao (2026-06-24) ---

def test_self_desc_por_profissao():
    from garimpo_esteira.draft.prompt import self_desc
    d = _lead(service_target="design")
    setattr(d, "profession", "design")
    assert "site" in self_desc(d)
    a = _lead(service_target="ambos")
    setattr(a, "profession", "ambos")
    assert "marketing" in self_desc(a)
    au = _lead(service_target="automacao")
    setattr(au, "profession", "automacao")
    assert "atendimento" in self_desc(au)


def test_self_desc_acentuado_client_facing():
    # o mock usa self_desc VERBATIM na mensagem -> precisa de acento correto
    from garimpo_esteira.draft.prompt import self_desc
    d = _lead(service_target="design")
    setattr(d, "profession", "design")
    assert "criação" in self_desc(d) and "negócio" in self_desc(d)


def test_build_prompt_injeta_nome_quando_ha_sender():
    lead = _lead(service_target="design")
    setattr(lead, "profession", "design")
    setattr(lead, "sender_name", "Gabriel")
    p = build_prompt(lead)
    assert "me chamo Gabriel" in p


def test_build_prompt_sem_sender_nao_inventa_nome():
    lead = _lead()
    p = build_prompt(lead)
    assert "nao tem nome cadastrado" in p
    assert "Apresente-se assim" not in p  # essa instrucao so existe quando ha nome


def test_strip_numbers_raspa_nota_e_avaliacoes():
    from garimpo_esteira.draft.prompt import _strip_numbers
    out = _strip_numbers("Black Gym nota 4.8 com 120 avaliacoes, cabe site.")
    assert "4.8" not in out and "120" not in out
    assert "boa reputacao" in out


def test_build_prompt_raspa_numero_do_diagnostico():
    lead = _lead(score_reason={"summary": "Bom pra design. X nota 4.9 com 9 avaliacoes."})
    p = build_prompt(lead)
    # o diagnostico nao pode levar o numero cru pro modelo
    assert "nota 4.9" not in p and "9 avaliacoes" not in p


def test_system_proibe_cargo_e_jargao():
    from garimpo_esteira.draft.prompt import SYSTEM_INSTRUCTION
    assert "gestor de trafego" in SYSTEM_INSTRUCTION
    assert "coach" in SYSTEM_INSTRUCTION.lower()


def test_mock_abertura_se_apresenta_com_nome():
    from garimpo_esteira.draft.mock import MockDraftProvider
    lead = _lead(service_target="design", website=None)
    setattr(lead, "profession", "design")
    setattr(lead, "sender_name", "Gabriel")
    msg1, _ = MockDraftProvider().generate(lead)
    assert "Me chamo Gabriel" in msg1
    assert "criação de site" in msg1  # client-facing, acentuado
    assert "—" not in msg1 and "nota" not in msg1.lower()


def test_mock_sem_nome_nao_quebra():
    from garimpo_esteira.draft.mock import MockDraftProvider
    lead = _lead(website=None)
    msg1, _ = MockDraftProvider().generate(lead)
    assert "Me chamo" not in msg1 and len(msg1) > 0


# ------------------------------------------------------------------
# Area de advocacia: copy informativa (nao vende) e A MURALHA — sinal de
# exposicao juridica prioriza na ficha e NUNCA entra na mensagem.
# ------------------------------------------------------------------

def _lead_adv(**kw) -> Lead:
    base = dict(
        id="l", owner_id="o", business_name="Transportadora Yara",
        category="transportadora", city="Maringa", phone="44999990001",
        service_target="advocacia", rating=3.1, reviews_count=280,
        company_status="INAPTA", opened_on="2013-04-01",
        natureza_juridica="206-2 - Sociedade Empresaria Limitada", socios_count=3,
    )
    base.update(kw)
    return Lead(**base)


def test_brief_juridico_entra_e_proibe_vender():
    p = build_prompt(_lead_adv())
    assert "ADVOCACIA" in p
    assert "resultado" in p.lower()
    assert "disposicao" in p.lower()


def test_muralha_exposicao_nao_vaza_pra_copy():
    lead = _lead_adv()
    lead.ai_signals = {
        "exposure": "empresa inapta e com reclamacoes de cobranca indevida",
        "context": "empresa com 12 anos de casa e 3 socios",
    }
    # o summary do score cita a situacao cadastral de proposito (ficha);
    # a copy nao pode ve-lo.
    lead.score_reason = {"summary": "Bom pra advocacia. Transportadora Yara: "
                                    "situacao inapta na Receita."}
    p = build_prompt(lead)

    # 1. Nenhum VALOR sensivel aparece em lugar nenhum do prompt. (Palavras
    #    como "reclamacao" existem no texto de PROIBICAO — o que nao pode
    #    vazar sao os dados deste lead.)
    for valor in ("cobranca indevida", "inapta", "3.1", "280"):
        assert valor.lower() not in p.lower(), valor

    # 2. A linha de FATOS (o que o modelo pode usar) so tem o neutro.
    fatos = next(l for l in p.splitlines() if l.startswith("Fatos neutros"))
    assert "12 anos de casa" in fatos
    assert "socios" in fatos
    for valor in ("inapta", "reclamac", "cobranca", "atrito", "nota"):
        assert valor not in fatos.lower(), valor


def test_advocacia_nao_usa_site_nem_rede_como_gancho():
    lead = _lead_adv(website=None, instagram=None)
    lead.ai_signals = {"context": "empresa com 12 anos de casa"}
    p = build_prompt(lead)
    fatos = next(l for l in p.splitlines() if l.startswith("Fatos neutros"))
    for termo in ("site", "instagram", "rede", "seguidores"):
        assert termo not in fatos.lower(), termo


def test_mock_de_advocacia_nao_vende_e_nao_vaza():
    from garimpo_esteira.draft.mock import MockDraftProvider
    lead = _lead_adv()
    setattr(lead, "sender_name", "Ana")  # injetado pelo draft_stage, nao e campo
    lead.ai_signals = {
        "exposure": "empresa inapta com reclamacoes de cobranca indevida",
        "context": "empresa com 12 anos de casa",
    }
    msg1, msg2 = MockDraftProvider().generate(lead)
    texto = f"{msg1} {msg2}".lower()
    assert "advogado" in texto
    assert "disposi" in texto
    for valor in ("inapta", "reclamac", "cobranca", "3.1", "280", "site",
                  "instagram", "garantia", "resultado"):
        assert valor not in texto, valor


def test_email_juridico_tem_assunto_assinatura_e_a_mesma_muralha():
    from garimpo_esteira.draft.prompt import build_email_prompt
    lead = _lead_adv()
    setattr(lead, "sender_name", "Ana Souza")
    setattr(lead, "oab", "123456/PR")
    lead.ai_signals = {"exposure": "empresa inapta", "context": "empresa com 12 anos de casa"}
    p = build_email_prompt(lead)
    assert "assunto" in p.lower()
    assert "OAB 123456/PR" in p
    assert "inapta" not in p.lower()
    assert "12 anos de casa" in p


def test_email_so_existe_pra_advocacia():
    from garimpo_esteira.draft.prompt import build_email_prompt
    assert build_email_prompt(_lead(service_target="trafego")) == ""


def test_mock_gera_email_so_pra_advocacia():
    from garimpo_esteira.draft.mock import MockDraftProvider
    prov = MockDraftProvider()
    assert prov.generate_email(_lead(service_target="trafego")) is None

    lead = _lead_adv()
    setattr(lead, "sender_name", "Ana Souza")
    setattr(lead, "oab", "123456/PR")
    lead.ai_signals = {"exposure": "empresa inapta", "context": "sociedade com 12 anos"}
    assunto, corpo = prov.generate_email(lead)
    assert assunto
    assert "Advogado" in corpo and "OAB 123456/PR" in corpo
    for valor in ("inapta", "reclamac", "3.1", "280", "garantia"):
        assert valor not in corpo.lower(), valor


def test_oab_label_monta_numero_barra_uf():
    from garimpo_esteira.owner_profile import oab_label
    assert oab_label({"oab_number": "123456", "oab_uf": "pr"}) == "123456/PR"
    assert oab_label({"oab_number": "123456"}) == "123456"
    assert oab_label({}) is None


# ------------------------------------------------------------------
# Contexto por AREA de atuacao: o advogado se apresenta pela area que
# atua, em linguagem de leigo, no WhatsApp e no e-mail.
# ------------------------------------------------------------------

def test_area_de_atuacao_muda_a_apresentacao():
    from garimpo_esteira.draft.prompt import legal_self_desc
    lead = _lead_adv()
    assert "assessoria jurídica" in legal_self_desc(lead)  # sem area marcada

    setattr(lead, "legal_areas", ["trabalhista"])
    assert "trabalhista" in legal_self_desc(lead)
    assert "funcionários" in legal_self_desc(lead)  # linguagem de leigo

    setattr(lead, "legal_areas", ["tributario"])
    assert "tributária" in legal_self_desc(lead)


def test_duas_areas_nomeiam_as_duas_sem_virar_lista():
    from garimpo_esteira.draft.prompt import legal_self_desc
    lead = _lead_adv()
    setattr(lead, "legal_areas", ["trabalhista", "tributario", "lgpd"])
    d = legal_self_desc(lead)
    assert "trabalhista" in d and "tributária" in d
    assert "proteção de dados" not in d  # so as duas primeiras


def test_prompt_e_mock_usam_a_area_e_sempre_dizem_advogado():
    from garimpo_esteira.draft.mock import MockDraftProvider
    lead = _lead_adv()
    setattr(lead, "sender_name", "Ana")
    setattr(lead, "legal_areas", ["trabalhista"])

    p = build_prompt(lead)
    assert "trabalhista" in p
    assert "advogado" in p.lower()

    msg1, _ = MockDraftProvider().generate(lead)
    assert "advogado" in msg1.lower()
    assert "trabalhista" in msg1.lower()


def test_email_leva_a_area_de_atuacao():
    from garimpo_esteira.draft.prompt import build_email_prompt
    lead = _lead_adv()
    setattr(lead, "legal_areas", ["societario"])
    assert "empresarial" in build_email_prompt(lead)


def test_muralha_travada_nenhum_campo_sensivel_vaza():
    """Guarda estrutural: enche TODO campo sensivel com um sentinela unico e
    exige que nenhum apareca no WhatsApp nem no e-mail. Se alguem ligar um
    campo novo no caminho de advocacia sem pensar, este teste quebra."""
    from garimpo_esteira.draft.mock import MockDraftProvider
    from garimpo_esteira.draft.prompt import build_email_prompt

    lead = _lead_adv()
    setattr(lead, "sender_name", "Ana")
    setattr(lead, "legal_areas", ["trabalhista"])
    sentinelas = {
        "exposure": "SENTINELAEXPOSURE",
        "company_status": "SENTINELASTATUS",
        "score_summary": "SENTINELASUMMARY",
        "review_elogio": "SENTINELAELOGIO",
    }
    lead.ai_signals = {
        "exposure": sentinelas["exposure"],
        "pain": sentinelas["exposure"],
        "context": "empresa com 12 anos de casa",
    }
    lead.company_status = sentinelas["company_status"]
    lead.score_reason = {"summary": sentinelas["score_summary"]}
    setattr(lead, "review_themes", {"elogio": sentinelas["review_elogio"]})

    saidas = [
        build_prompt(lead),
        build_email_prompt(lead),
        " ".join(MockDraftProvider().generate(lead)),
        " ".join(MockDraftProvider().generate_email(lead)),
    ]
    for saida in saidas:
        for nome, sentinela in sentinelas.items():
            assert sentinela not in saida, nome


# ------------------------------------------------------------------
# Flexao de genero: "Me chamo Helena, sou advogado" era erro de
# concordancia no nome da propria dona da conta, na PRIMEIRA mensagem
# a um cliente. A escolha vem do perfil, nunca do primeiro nome.
# ------------------------------------------------------------------

def _lead_advogada(**kw):
    lead = _lead_adv(**kw)
    setattr(lead, "profession", "advocacia")
    setattr(lead, "sender_name", "Helena Costa")
    setattr(lead, "oab", "148233/PR")
    setattr(lead, "legal_areas", ["trabalhista"])
    return lead


def test_copy_no_feminino_quando_o_perfil_diz_feminino():
    from garimpo_esteira.draft.mock import MockDraftProvider

    lead = _lead_advogada()
    setattr(lead, "professional_gender", "f")
    msg1, _ = MockDraftProvider().generate(lead)
    _, corpo = MockDraftProvider().generate_email(lead)

    assert "sou advogada" in msg1
    assert "sou advogado " not in msg1  # nao sobrou o masculino em lugar nenhum
    assert "Advogada" in corpo
    assert "\nAdvogado\n" not in corpo


def test_copy_no_masculino_por_padrao_quando_nao_escolheram():
    """Perfil sem escolha mantem o masculino: e o comportamento que existia
    antes do campo, entao ninguem muda de copy sem pedir."""
    from garimpo_esteira.draft.mock import MockDraftProvider

    lead = _lead_advogada()  # sem professional_gender
    msg1, _ = MockDraftProvider().generate(lead)
    _, corpo = MockDraftProvider().generate_email(lead)

    assert "sou advogado" in msg1
    assert "Advogado" in corpo


def test_prompt_da_ia_carrega_a_flexao_escolhida():
    """A IA nao pode escolher o genero sozinha: o prompt manda a flexao."""
    lead = _lead_advogada()
    setattr(lead, "professional_gender", "f")
    p = build_prompt(lead)
    assert "advogada" in p
    assert "ADVOGADA" in p

    from garimpo_esteira.draft.prompt import build_email_prompt
    e = build_email_prompt(lead)
    assert "Advogada" in e


# ------------------------------------------------------------------
# Area consultiva: quem atua fora do contencioso (contratos, compliance,
# negociacao) marcava societario + LGPD e funcionava por acidente. Agora
# tem area propria, com apresentacao e sub-pesos proprios.
# ------------------------------------------------------------------

def test_area_consultiva_se_apresenta_pela_atuacao_consultiva():
    from garimpo_esteira.draft.prompt import legal_self_desc
    lead = _lead_adv()
    setattr(lead, "legal_areas", ["consultivo"])
    desc = legal_self_desc(lead)
    assert "consultiva" in desc
    assert "contratos" in desc


def test_area_consultiva_combina_com_outra_area():
    from garimpo_esteira.draft.prompt import legal_self_desc
    lead = _lead_adv()
    setattr(lead, "legal_areas", ["consultivo", "trabalhista"])
    assert "consultiva" in legal_self_desc(lead)


def test_area_consultiva_entra_no_prompt_com_o_que_observar():
    lead = _lead_adv()
    setattr(lead, "profession", "advocacia")
    setattr(lead, "legal_areas", ["consultivo"])
    p = build_prompt(lead)
    assert "contratual" in p
