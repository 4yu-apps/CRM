"""Monta o contexto do lead para o rascunho (compartilhado por mock e Gemini).

A copy DEPENDE de duas coisas:
1. A PROFISSAO de quem prospecta (gestor de trafego, automacao, design, social) ->
   chega aqui como `service_target` (o score deriva isso da profissao). Define o
   angulo e o pitch.
2. A CATEGORIA do negocio (a tag) -> define o que faz sentido observar e perguntar
   (alimentacao fala de canal de venda; clinica/salao de agenda; loja de venda online).

O prompt da um METODO de analise pro modelo: olhar os sinais, escolher UM gancho
real (elogio especifico + gap que o meu servico resolve + pergunta tipica da
categoria), e escrever gentil, sem parecer forcado. Tom B2B humano, pt-BR.
"""
from __future__ import annotations

import re

from ..models import Lead
from ..validation import is_present

# Tira numero cru (nota X.X / "N avaliacoes") de qualquer texto de contexto, pra
# o modelo nao ter o numero pra citar (o numero soa raspado na mensagem).
_NUM_RE = (
    (re.compile(r"\bnota\s*\d+[.,]?\d*", re.I), "boa reputacao"),
    (re.compile(r"\(?\bcom\s+\d+\s*avalia\w*\)?", re.I), ""),
    (re.compile(r"\(?\b\d+\s*avalia\w*\)?", re.I), ""),
)


def _strip_numbers(text: str) -> str:
    for rx, repl in _NUM_RE:
        text = rx.sub(repl, text)
    return re.sub(r"\s{2,}", " ", text).strip()


def lead_brief(lead: Lead) -> dict[str, object]:
    return {
        "nome": lead.business_name or "o negocio",
        "segmento": lead.category or "",
        "cidade": lead.city or "",
        "nota": lead.rating,
        "avaliacoes": lead.reviews_count,
        "tem_site": is_present("website", lead.website),
        "tem_instagram": is_present("instagram", lead.instagram),
    }


SYSTEM_INSTRUCTION = (
    "Voce escreve a PRIMEIRA mensagem de prospeccao no WhatsApp EM NOME de uma pessoa real "
    "(o nome dela e o que ela faz vem no brief). Tem que soar GENTE puxando conversa com um "
    "negocio local: humano, curioso, gentil. NAO e vendedor, NAO e script, NAO e coach. "
    "Portugues do Brasil natural, com acentuacao correta. NUNCA invente dados.\n\n"

    "A msg1 (abertura) e enviada SOZINHA. O pitch (msg2) e um passo opcional, mandado "
    "depois SO se a pessoa responder. Entao a abertura tem que se sustentar sozinha e NAO "
    "pode vender nada.\n\n"

    "COMO PENSAR antes de escrever (raciocinio interno, nao mostre na mensagem): qual o "
    "fato mais concreto e real desse negocio (boa reputacao, nao tem site, ja anuncia, "
    "Instagram parado, site antigo) e qual pergunta de CURIOSIDADE genuina cabe ali. Use "
    "SOMENTE fatos reais dos sinais. Sem nenhum fato concreto, nao escreva.\n\n"

    "ESTRUTURA da msg1 (solta, VARIE a cada lead, nada de molde fixo):\n"
    "1. Cumprimento natural e variado: 'Oi, tudo bem?' / 'Opa, tudo bem?' / 'Bom dia, tudo certo?'.\n"
    "2. Apresentacao leve: 'me chamo {NOME}, {o que faco}'. Isso e SO quem voce e, NAO uma oferta.\n"
    "3. Uma observacao REAL e curiosa sobre o negocio (encontrou no Google + um sinal real), "
    "honesta, do jeito que um humano comentaria. NUNCA acusacao nem diagnostico.\n"
    "4. UMA pergunta aberta, de curiosidade genuina, como voce perguntaria a um conhecido. "
    "Faca UMA pergunta so.\n\n"

    "msg2 (pitch leve, passo 2): o valor em uma frase simples + convite leve ('posso te "
    "mandar um exemplo?', 'faz sentido a gente trocar uma ideia?'). NAO marque reuniao de cara.\n\n"

    "TOM: conversa de verdade, gentil, de igual pra igual, curioso. A abertura tem 3 a 4 "
    "frases e termina numa pergunta. Linguagem natural, nao viciosa: NAO repita 'voces' "
    "(no maximo 2 na abertura), nao comece duas frases seguidas com a mesma palavra.\n\n"

    "Exemplo de TOM (adapte, NAO copie):\n"
    "msg1: 'Oi, tudo bem? Me chamo Gabriel, mexo com criacao de site pra negocio local. "
    "Cai na Black Gym aqui pelo Google, gostei das avaliacoes de voces, mas nao achei um "
    "site. Fiquei curioso, hoje quem quer treinar ai acha os planos por onde?'\n"
    "msg2: 'Eu monto site pra negocio local, bonito e rapido, que passa confianca pra quem "
    "encontra voces. Posso te mandar um exemplo?'\n\n"

    "PROIBIDO (elimine qualquer uma destas expressoes ou atitude):\n"
    "- travessao (use virgula, parenteses ou ponto)\n"
    "- cargo pomposo: 'gestor de trafego', 'gestor de growth', 'especialista', 'sou consultor'\n"
    "- jargao que leigo nao entende (trafego pago, funil, lead, conversao, CRM, engajamento)\n"
    "- 'regiao', 'aqui na regiao', 'aqui perto', 'na sua regiao' (a busca e nacional; diga 'no Google')\n"
    "- numero cru (nota, quantidade de avaliacoes): fale 'otima reputacao', NUNCA 'nota 4.8' nem 'X avaliacoes'\n"
    "- vender ou ofertar na abertura (a oferta e a msg2)\n"
    "- pergunta-diagnostico ou agressiva ('voces perdem cliente?', 'quantos leads escapam?', "
    "'voces estao deixando dinheiro na mesa?')\n"
    "- 'espero que esteja bem', 'venho por meio desta', 'aproveitar esta oportunidade'\n"
    "- 'revolucionar', 'alavancar', 'solucao comprovada', 'sem compromisso', 'prezado', 'guru'\n"
    "- 'nao e so X, e Y', regra de tres, estatistica magica ('aumenta 3x'), urgencia falsa\n"
    "- lista de bullets, mais de 1 emoji\n"
    "- elogio generico e vazio ('adorei o trabalho de voces', 'que trabalho incrivel')\n"
)

# Foco da copy por servico/profissao -- orienta o gancho e o pitch.
_SERVICE_BRIEF = {
    "trafego": (
        "Servico: TRAFEGO (anuncio local). Gancho em movimento e visibilidade. "
        "Valor: aparecer pra quem busca perto sem depender da sorte do Instagram. "
        "Se ja anuncia, o angulo e OTIMIZAR (gastar melhor o que ja roda); se nao "
        "anuncia, e COMECAR a atrair cliente novo. "
        "Se o negocio for de alimentacao (restaurante, pizzaria, lanchonete, "
        "hamburgueria, etc.), pergunte de leve sobre o canal de vendas deles, por "
        "exemplo: 'voces ja trabalham com iFood ou tem canal proprio?' ou "
        "'voces estao no iFood ou e mais no salao/proprio?'. Isso e uma PERGUNTA "
        "genuina (nao sabemos a resposta), nunca afirme que eles dependem do iFood. "
        "PROIBIDO falar de site: NUNCA sugira criar, refazer ou modernizar site, "
        "nem cite WordPress/Wix/landing. Site nao e o seu servico (no maximo e o "
        "destino do anuncio, nunca a oferta). Nao comente que falta site."
    ),
    "automacao": (
        "Servico: AUTOMACAO (chatbot/atendimento no WhatsApp). Gancho em volume e "
        "operacao (muito cliente, atende e agenda na mao). Valor: atendimento que "
        "responde e agenda sozinho, sem perder cliente quando esta cheio. Se a "
        "categoria for de agendamento (clinica, salao, barbearia, pet, academia), "
        "pergunte como lidam com a agenda hoje (na mao pelo WhatsApp?). "
        "PROIBIDO falar de site: NUNCA sugira criar, refazer ou modernizar site, "
        "nem cite WordPress/Wix. Seu servico e atendimento/WhatsApp, nao site. "
        "Nao comente que falta site."
    ),
    "ambos": (
        "Servico: TRAFEGO + AUTOMACAO. Lidera com trafego e cita a automacao de "
        "leve no fim como upsell ('e ainda da pra automatizar o atendimento depois'). "
        "PROIBIDO falar de site: NUNCA sugira criar, refazer ou modernizar site, "
        "nem cite WordPress/Wix. Site nao e o seu servico. Nao comente que falta site."
    ),
    "design": (
        "Servico: DESIGN / SITE. Gancho na presenca digital (site fraco, antigo, "
        "lento no celular, nao adaptado, ou ausente). Valor: um site/visual bonito e "
        "rapido que passa confianca e converte quem encontra o negocio. "
        "Se o site estiver lento/antigo ou ausente, pergunte de leve: "
        "'manter isso atualizado no dia a dia e chato, ne? voces sentem falta?'"
    ),
    "marketing": (
        "Servico: MARKETING / SOCIAL. Gancho na presenca da marca nas redes "
        "(rede fraca, parada ou ausente). Valor: presenca constante e cuidada que "
        "mantem o negocio na cabeca do cliente. NAO prometa numero de seguidores. "
        "Se tiver bem avaliado mas sem presenca digital, pergunte: "
        "'clientes que ja conhecem voltam, mas indicam? como chega gente nova?'"
    ),
    "advocacia": (
        "Servico: ADVOCACIA (assessoria juridica). A mensagem INFORMA "
        "disponibilidade, nao vende: apresentacao sobria, uma observacao neutra, "
        "e o fecho se colocando a disposicao caso a empresa ainda nao tenha "
        "assessoria juridica. Nunca prometa resultado, nunca cite caso concreto "
        "ou problema da empresa, nunca fale de valores."
    ),
    "indefinido": (
        "Servico: a definir; lidere com trafego (anuncio local) como padrao. "
        "Nao sugira criar site nem cite WordPress/Wix."
    ),
}

# profissao do dono -> qual brief de copy usar.
_PROF_TO_BRIEF = {
    "trafego": "trafego", "automacao": "automacao", "ambos": "ambos",
    "design": "design", "web": "design", "branding": "design",
    "marketing": "marketing", "advocacia": "advocacia",
}

# Auto-descricao em LINGUAGEM DE LEIGO ("me chamo X, {isto}"). Ninguem entende
# "gestor de trafego/growth"; "marketing pra negocio local" e o guarda-chuva que
# todo mundo entende. So foge dele quando e concretamente site ou atendimento.
# Acentuado de proposito: o mock usa isto VERBATIM na mensagem (client-facing).
_SELF_DESC = {
    "trafego": "trabalho com marketing pra negócio local",
    "ambos": "trabalho com marketing pra negócio local",
    "marketing": "trabalho com marketing pra negócio local",
    "automacao": "trabalho com atendimento no WhatsApp pra negócio local",
    "design": "mexo com criação de site pra negócio local",
    "dev": "desenvolvo site e sistema pra negócio local",
    "advocacia": "sou advogado",
    "indefinido": "trabalho com marketing pra negócio local",
}


def self_desc(lead: Lead) -> str:
    return _SELF_DESC.get(_brief_key(lead), _SELF_DESC["indefinido"])

# Categoria do negocio (a tag) -> o que faz sentido observar e perguntar. Da pro
# modelo um norte do que e relevante naquele ramo (a pergunta honesta da msg1).
# Match por substring; keywords curadas pra evitar colisao (ex.: sem "bar" solto,
# que pegaria "barbearia"; sem "spa", que pegaria "espaco").
_CATEGORY_CUES: tuple[tuple[tuple[str, ...], str], ...] = (
    (("restaurante", "pizzaria", "pizza", "lanchonete", "hamburg", "churrasc",
      "padaria", "confeitaria", "cafeteria", "cafe", "sushi", "japonesa", "italiana",
      "comida", "buffet", "boteco", "sorveteria", "acai", "marmita", "pastel",
      "esfiha", "temaki", "doceria", "hortifruti"),
     "alimentacao: pergunte do canal de venda (iFood vs salao/proprio) e do delivery"),
    (("clinic", "odonto", "dentist", "consultorio", "saude", "medic", "fisio",
      "psicolog", "nutri", "derma", "fono", "laborator", "vacina"),
     "saude: foco em captacao de pacientes e na agenda; tom sobrio, sem prometer resultado clinico"),
    (("salao", "barbear", "estetic", "manicure", "sobrancelha", "cilios", "depilac",
      "beleza", "cabelo", "maquiag", "tattoo", "tatuagem"),
     "beleza/estetica: agenda cheia, recorrencia e atrair cliente novo na regiao"),
    (("academia", "fitness", "pilates", "crossfit", "muscul", "personal", "yoga",
      "jiu", "danca"),
     "fitness: captacao e retencao de alunos, matricula e aula experimental"),
    (("pet", "veterin", "tosa"),
     "pet: recorrencia (banho/tosa/consulta) e agendamento"),
    (("advog", "advocac", "contabil", "contador", "juridic", "cartorio", "arquitet",
      "engenh"),
     "servico profissional: autoridade e captacao qualificada; tom sobrio, sem promessa de resultado (restricao do conselho)"),
    (("loja", "boutique", "moda", "calcado", "otica", "joalheria", "papelaria",
      "mercado", "atacad", "varejo", "movei", "eletro", "farmacia", "drogaria"),
     "varejo/loja: vitrine online, venda pelo digital e trafego pra loja/e-commerce"),
    (("escola", "curso", "autoescola", "auto escola", "faculdade", "ensino",
      "idiomas", "reforco", "creche"),
     "educacao: captacao de matriculas e turmas"),
    (("imobiliar", "corretor", "imovel", "incorporad"),
     "imobiliaria: leads qualificados de quem busca comprar ou alugar"),
)


def _category_cue(category: str | None) -> str:
    cat = (category or "").lower()
    for keys, cue in _CATEGORY_CUES:
        if any(k in cat for k in keys):
            return cue
    return ""


def _brief_key(lead: Lead) -> str:
    prof = (getattr(lead, "profession", None) or "").strip().lower()
    if prof in _PROF_TO_BRIEF:
        return _PROF_TO_BRIEF[prof]
    # sem profissao: cai no servico-alvo do score (trafego/automacao/ambos/...)
    return getattr(lead, "service_target", "indefinido") or "indefinido"


def _marketing_angle(lead: Lead) -> str:
    """Faixa do ICP de marketing pra escolher o angulo da copy: 'construir'
    (sem/fraca presenca), 'escalar' (presenca ativa e recorrente) ou 'morno'.
    Le social_signals (ig_status/post_freq) — o retrato ja guardado no lead."""
    if not (getattr(lead, "instagram", None) or "").strip():
        return "construir"
    soc = getattr(lead, "social_signals", None) or {}
    status = soc.get("ig_status")
    try:
        pf = float(soc["post_freq"]) if soc.get("post_freq") is not None else None
    except (TypeError, ValueError):
        pf = None
    recurrent = pf is not None and pf >= 1.0
    if status == "parado":
        return "construir"
    if recurrent and status != "parado":
        return "escalar"
    return "morno"


_MARKETING_ANGLE_BRIEF = {
    "escalar": (
        " ANGULO: a marca JA tem presenca ativa (posta, tem audiencia). Nao fale "
        "como se ela nao existisse nas redes; o gancho e ESCALAR/OTIMIZAR — mais "
        "alcance, conteudo com estrategia, constancia com qualidade. Reconheca o "
        "que ja fazem antes de propor."
    ),
    "construir": (
        " ANGULO: presenca fraca ou ausente; o gancho e CONSTRUIR/MOVIMENTAR a "
        "presenca — assumir as redes, dar ritmo, aparecer pra quem ainda nao "
        "conhece o negocio."
    ),
    "morno": (
        " ANGULO: presenca inconstante (posta as vezes, sem ritmo); o gancho e "
        "PROFISSIONALIZAR — transformar posts avulsos numa presenca com estrategia."
    ),
}


# ---------------------------------------------------------------------
# ADVOCACIA — composicao PROPRIA, nao a compartilhada.
#
# A MURALHA: a montagem comum injeta score_reason.summary ("Diagnostico") e
# sinais de reputacao/site/rede na mensagem. Pro advogado isso e proibido: o
# summary da lente juridica cita situacao cadastral, e os sinais citam nota e
# avaliacoes. Por isso advocacia NAO reusa aquela cauda — ela monta do zero,
# lendo um unico campo neutro (ai_signals.context) e mais nada.
# ---------------------------------------------------------------------
_ADVOCACIA_SYSTEM = (
    "Voce escreve a PRIMEIRA mensagem de um ADVOGADO a uma empresa, no WhatsApp. "
    "Registro sobrio e institucional, portugues do Brasil com acentuacao correta, "
    "sem emoji, sem girias e sem informalidade excessiva. NUNCA invente dados.\n\n"

    "A mensagem NAO VENDE e NAO OFERECE nada. Ela apenas se apresenta e informa "
    "disponibilidade. Estrutura da msg1 (3 a 4 frases):\n"
    "1. Cumprimento formal e breve.\n"
    "2. Quem fala: nome, que e advogado, e a area de atuacao.\n"
    "3. UMA observacao neutra e publica sobre a empresa (tempo de casa, porte, "
    "numero de socios). Nunca um problema, nunca um diagnostico.\n"
    "4. Fecho se colocando a disposicao caso ainda nao tenham assessoria "
    "juridica, sem pedir nada em troca.\n\n"

    "msg2 (so se a pessoa responder): uma frase dizendo em que tipo de demanda "
    "voce costuma atuar, e um convite leve pra conversar. Continua sem prometer "
    "nada.\n\n"

    "PROIBIDO, sem excecao:\n"
    "- prometer, insinuar ou sugerir resultado de qualquer natureza\n"
    "- mencionar caso concreto, processo, reclamacao, divida, irregularidade, "
    "situacao cadastral, nota ou avaliacao da empresa\n"
    "- falar de honorarios, valores, condicoes ou desconto\n"
    "- urgencia, medo ou escassez ('antes que seja tarde', 'risco iminente')\n"
    "- citar exito passado, numero de casos, ou comparar com outro profissional\n"
    "- pergunta-diagnostico ('voces ja foram processados?', 'tem passivo?')\n"
    "- falar de site, Instagram, marketing ou presenca digital\n"
    "- a palavra 'oportunidade' e qualquer verbo de venda\n"
    "- travessao, lista de bullets, emoji\n"
)


def _build_prompt_advocacia(lead: Lead) -> str:
    """Prompt da area de advocacia. Le SO o `context` da IA (fato neutro) e o
    numero de socios. Nenhum sinal de exposicao, reputacao, situacao cadastral
    ou presenca digital passa por aqui — ver a muralha, acima."""
    ai = getattr(lead, "ai_signals", None) or {}
    neutros: list[str] = []
    ctx = ai.get("context")
    if isinstance(ctx, str) and ctx.strip():
        neutros.append(ctx.strip())
    try:
        n_socios = int(lead.socios_count)
    except (TypeError, ValueError):
        n_socios = 0
    if n_socios >= 2:
        neutros.append(f"sociedade com {n_socios} socios")
    fatos = "; ".join(neutros) or "poucos fatos publicos"

    sender = (getattr(lead, "sender_name", None) or "").strip()
    if sender:
        ident = (f"Quem fala: {sender}, advogado. Apresente-se assim: "
                 f"'me chamo {sender}, sou advogado'.\n")
    else:
        ident = ("Quem fala nao tem nome cadastrado: NAO invente nome nem numero "
                 "de OAB. Apresente-se apenas como advogado.\n")

    cidade = lead.city or ""
    return (
        f"{_ADVOCACIA_SYSTEM}\n"
        f"{ident}"
        f"{_SERVICE_BRIEF['advocacia']}\n\n"
        f"Empresa: {lead.business_name or 'a empresa'}"
        f"{f' em {cidade}' if cidade else ''}.\n"
        f"Fatos neutros (use no maximo UM, e so estes): {fatos}.\n\n"
        "Ancora obrigatoria: a observacao da msg1 sai de UM dos fatos neutros "
        "acima. Se nao houver nenhum fato util, escreva sem observacao — melhor "
        "uma mensagem curta que uma observacao inventada.\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )


def build_prompt(lead: Lead) -> str:
    b = lead_brief(lead)
    key = _brief_key(lead)
    # advocacia tem composicao propria (a muralha): sai antes de montar
    # qualquer sinal de reputacao, site, rede ou diagnostico do score.
    if key == "advocacia":
        return _build_prompt_advocacia(lead)
    # So profissoes que VENDEM site (design/web/branding -> key "design") podem
    # usar site como gancho. Pra trafego/automacao/ambos/marketing, site nao e o
    # servico: nao entra como sinal nem vira sugestao na abertura.
    sells_site = key == "design"
    sig = getattr(lead, "site_signals", None) or {}
    # contexto pra VOCE, modelo. NAO repita numeros na mensagem (ver regra critica).
    sinais: list[str] = []
    if b["nota"] is not None and b["nota"] >= 4.3:
        sinais.append("boa reputacao no Google (bem avaliado)")
    elif b["nota"] is not None:
        sinais.append("reputacao mediana")
    # Sinais de site so entram pra quem vende site. Pra trafego/automacao eles
    # nao aparecem (senao a IA usa "nao tem site" como gancho e sugere criar um).
    if sells_site:
        if not b["tem_site"]:
            sinais.append("nao tem site (oportunidade de criar a presenca)")
        elif sig.get("mobile_ready") is False:
            sinais.append("tem site, mas nao e adaptado pra celular")
        elif sig.get("stack") in ("wix", "wordpress", "squarespace"):
            sinais.append(f"site feito em {sig.get('stack')} (da pra modernizar)")
        ps = sig.get("perf_score")
        if isinstance(ps, (int, float)) and ps < 50 and b["tem_site"]:
            sinais.append("site lento no celular (PageSpeed baixo)")
    if not b["tem_instagram"]:
        sinais.append("sem presenca no Instagram")
    social = getattr(lead, "social_signals", None) or {}
    if social.get("ig_status") == "parado":
        sinais.append("Instagram parado")
    extra_ch = [c for c, on in (
        ("TikTok", sig.get("has_tiktok")),
        ("YouTube", sig.get("has_youtube")),
        ("LinkedIn", sig.get("has_linkedin")),
    ) if on]
    if extra_ch:
        sinais.append("ja esta em " + ", ".join(extra_ch))
    if sig.get("has_chat_widget") is False and key == "automacao":
        sinais.append("atende sem chatbot no site (tudo na mao)")
    if sig.get("has_online_booking") is True:
        sinais.append("ja usa agendamento online")
    if sig.get("has_ecommerce") is True:
        sinais.append("vende online (loja/checkout no site)")

    # Sinais de MARKETING: presenca digital (IG rico + Google). Contexto pra VOCE,
    # modelo — NUNCA repita numeros na mensagem. So entram na area de marketing.
    if key == "marketing":
        fol = social.get("followers")
        if isinstance(fol, int) and fol > 0:
            sinais.append(f"{fol} seguidores no Instagram")
        er = social.get("engagement_rate")
        if isinstance(er, (int, float)):
            sinais.append(f"engajamento de {er}% no Instagram")
        pf = social.get("post_freq")
        if isinstance(pf, (int, float)):
            sinais.append("posta com recorrencia" if pf >= 1 else "quase nao posta (presenca parada)")
        if not (getattr(lead, "maps_place_id", None) or b["nota"] is not None):
            sinais.append("sem Perfil de Empresa no Google (presenca incompleta)")

    # "Ja anuncia?": define o angulo de trafego (otimizar x comecar). ad_platforms
    # diz EM QUE plataforma. Mantem o angulo condicional do anuncio-sem-site.
    ads = getattr(lead, "ads_active", None)
    plats = social.get("ad_platforms") or sig.get("ad_platforms") or []
    onde = f" ({', '.join(plats)})" if plats else ""
    ja_anuncia = ads is True or bool(plats)
    if ja_anuncia and not b["tem_site"] and sells_site:
        sinais.append(
            "ja investe em anuncio mas nao tem site pra reter "
            "(paga pra trazer cliente e deixa escapar)"
        )
    elif ja_anuncia:
        sinais.append(f"ja investe em anuncio{onde} (da pra otimizar o que ja roda)")
    elif ads is False:
        sinais.append("nao anuncia ainda (oportunidade de comecar)")
    if key in ("trafego", "ambos") and ja_anuncia:
        intensidade = []
        if isinstance(social.get("ads_count"), int):
            intensidade.append(f"{social['ads_count']} anuncios ativos")
        if social.get("ads_since"):
            intensidade.append(f"anuncia desde {social['ads_since']}")
        if intensidade:
            sinais.append("intensidade de anuncio: " + ", ".join(intensidade))

    # angulo condicional: base fiel grande que nao consegue rechamar quem ja foi
    nota = b["nota"]
    aval = b["avaliacoes"]
    if (nota is not None and nota >= 4.5
            and aval is not None and aval >= 150
            and (not b["tem_site"] or not b["tem_instagram"])):
        sinais.append(
            "base fiel grande (bem avaliado e movimentado) que nao consegue "
            "rechamar o cliente que ja foi la"
        )

    # ancora de elogios reais (review_themes.elogio, quando disponivel)
    themes = getattr(lead, "review_themes", None) or {}
    if themes.get("elogio"):
        sinais.append(f"os clientes elogiam {themes['elogio']}")

    sinais_txt = "; ".join(sinais) or "poucos sinais publicos"

    # linha de diagnostico do analista (score_reason.summary), quando disponivel.
    # Raspa o numero cru (o summary as vezes traz "nota 4.9 com 9 avaliacoes").
    reason = getattr(lead, "score_reason", None) or {}
    diagnostico = _strip_numbers(reason.get("summary") or "")
    diag_linha = (
        f"Diagnostico (base do gancho): {diagnostico}\n\n" if diagnostico else ""
    )

    # o que e tipico da categoria (tag) -> orienta a pergunta da msg1
    cue = _category_cue(b["segmento"])
    cue_linha = f"Tipico da categoria: {cue}.\n" if cue else ""

    # Quem fala: nome (cadastrado pelo dono) + auto-descricao de leigo. Sem nome,
    # nao inventa: abre com um motivo humano sem se nomear.
    sender = (getattr(lead, "sender_name", None) or "").strip()
    desc = self_desc(lead)
    if sender:
        ident = f"Quem fala: {sender}. Apresente-se assim: 'me chamo {sender}, {desc}'.\n"
    else:
        ident = (
            f"Quem fala nao tem nome cadastrado: NAO invente nome. Abra com um motivo "
            f"humano (ex.: 'tava dando uma olhada em {b['segmento'] or 'negocios'} no Google "
            f"e encontrei voces'). Voce {desc}.\n"
        )

    ancora = (
        "Ancora obrigatoria: a observacao da msg1 sai de UM fato real deste negocio "
        "(a boa reputacao, o Instagram parado, a falta de site, o site antigo, ja anunciar). "
        "NUNCA numero cru. Sem um fato concreto, nao escreva."
    )

    brief_txt = _SERVICE_BRIEF.get(key, _SERVICE_BRIEF["indefinido"])
    if key == "marketing":
        brief_txt += _MARKETING_ANGLE_BRIEF.get(_marketing_angle(lead), "")

    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"{ident}"
        f"{brief_txt}\n\n"
        f"{diag_linha}"
        f"Negocio: {b['nome']} ({b['segmento']}) em {b['cidade']}.\n"
        f"{cue_linha}"
        f"Sinais: {sinais_txt}.\n\n"
        f"{ancora}\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )


# ---------------------------------------------------------------------
# E-MAIL formal (canal proprio da area de advocacia)
#
# WhatsApp frio de advogado e o registro mais exposto da profissao; o e-mail
# institucional cabe muito melhor. O endereco ja vem da Receita (cnpj.py emite
# `email`), entao o dado existe sem coleta nova. Sem envio automatico: o humano
# copia e manda, igual ao WhatsApp.
#
# Vale a MESMA muralha: le so `ai_signals.context`.
# ---------------------------------------------------------------------
_EMAIL_SYSTEM = (
    "Voce escreve um E-MAIL institucional de apresentacao EM NOME de um ADVOGADO. "
    "Registro formal, portugues do Brasil com acentuacao correta, sem emoji e sem "
    "informalidade. NUNCA invente dados.\n\n"

    "O e-mail NAO VENDE e NAO OFERECE: apresenta quem e, cita UM fato neutro e "
    "publico sobre a empresa, e se coloca a disposicao caso ainda nao tenham "
    "assessoria juridica. Fecha com assinatura: nome, 'Advogado', e OAB/UF.\n\n"

    "O assunto e curto e descritivo, sem verbo de venda e sem promessa "
    "(ex.: 'Apresentacao profissional' ou 'Assessoria juridica empresarial').\n\n"

    "PROIBIDO, sem excecao:\n"
    "- prometer, insinuar ou sugerir resultado de qualquer natureza\n"
    "- mencionar caso concreto, processo, reclamacao, divida, irregularidade, "
    "situacao cadastral, nota ou avaliacao da empresa\n"
    "- falar de honorarios, valores, condicoes ou desconto\n"
    "- urgencia, medo ou escassez\n"
    "- citar exito passado, numero de casos, ou comparar com outro profissional\n"
    "- pergunta-diagnostico\n"
)


def build_email_prompt(lead: Lead) -> str:
    """Prompt do e-mail formal. SO a area de advocacia usa; nas outras devolve
    string vazia (o canal continua sendo so o WhatsApp)."""
    if _brief_key(lead) != "advocacia":
        return ""

    ctx = ((getattr(lead, "ai_signals", None) or {}).get("context") or "").strip()
    sender = (getattr(lead, "sender_name", None) or "").strip()
    oab = (getattr(lead, "oab", None) or "").strip()

    if sender:
        assinatura = f"Assine como: {sender}, Advogado" + (f", OAB {oab}" if oab else "")
    else:
        assinatura = ("Nao ha nome cadastrado: NAO invente nome nem numero de OAB; "
                      "assine apenas como 'Advogado'")

    linhas = [
        f"empresa: {lead.business_name or '-'}",
        f"cidade: {lead.city or '-'}",
        f"fato neutro (use no maximo este): {ctx or '-'}",
        assinatura + ".",
    ]
    return (
        f"{_EMAIL_SYSTEM}\n\nFATOS:\n" + "\n".join(linhas) +
        '\n\nResponda em JSON: {"assunto": "...", "corpo": "..."}'
    )
