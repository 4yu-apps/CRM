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

from ..models import Lead
from ..validation import is_present


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
    "Voce escreve a PRIMEIRA mensagem de prospeccao no WhatsApp, EM NOME de um "
    "profissional autonomo (o servico dele vem no brief abaixo). Toda a copy gira em "
    "torno desse servico e da realidade real do negocio. Tom de quem fala com um "
    "conhecido: caloroso, gentil, simples, sem cara de vendedor nem de template. "
    "Portugues do Brasil com acentuacao correta. NUNCA invente dados.\n\n"

    "COMO PENSAR antes de escrever (raciocinio interno, nao mostre na mensagem):\n"
    "1. O que esse negocio faz BEM (boa reputacao, algo que os clientes destacam) -> "
    "vira um elogio ESPECIFICO e verdadeiro. Nada generico tipo 'amei o trabalho de voces'.\n"
    "2. O GAP que o MEU servico resolve (sem site, Instagram parado, nao anuncia, atende "
    "tudo na mao, site lento, sem agendamento online...) -> vira o motivo real do contato.\n"
    "3. O que e tipico da CATEGORIA do negocio -> vira a pergunta honesta.\n"
    "Escolha UM gancho so: o mais concreto e ligado ao meu servico. Use SOMENTE fatos "
    "reais dos sinais. Sem nenhum fato concreto, nao escreva a abertura.\n\n"

    "COPYWRITING: elogio especifico e verdadeiro (algo que voce realmente observou nos "
    "sinais), conectado a um gap real, mais UMA pergunta honesta (curiosidade de verdade, "
    "nao diagnostico disfarcado de pergunta). Gentil, de igual pra igual, nunca de cima "
    "pra baixo, nunca forcado nem bajulador.\n\n"

    "Estrutura das 2 mensagens:\n"
    "- msg1: cumprimento leve ('Oi, tudo bem?'), diz que encontrou o negocio na regiao, "
    "faz o elogio especifico, confirma o que eles fazem ('vi que voces trabalham com X, "
    "certo?') e termina com UMA pergunta leve ligada ao servico E a categoria. PERGUNTE "
    "em vez de afirmar: va da conclusao pra curiosidade, nunca do diagnostico pra proposta. "
    "Ex: se nao sabe se estao no iFood, PERGUNTE ('voces ja trabalham com iFood?'), nao "
    "afirme ('voce depende do iFood').\n"
    "- msg2: o valor em uma frase simples + um convite leve e aberto ('podemos trocar uma "
    "ideia?', 'posso te mandar um exemplo?'). Nao marque reuniao de cara. CTA de baixo "
    "atrito: nunca 'vamos marcar uma call'.\n\n"

    "Exemplo de TOM (adapte ao negocio, nao copie):\n"
    "msg1: 'Oi, tudo bem? Encontrei a Clinica Bella aqui na regiao e gostei do cuidado que "
    "voces tem com os pacientes. Vi que trabalham com estetica, certo? Hoje os agendamentos "
    "chegam mais por indicacao ou voces ja anunciam pra atrair gente nova?'\n"
    "msg2: 'Eu ajudo negocio local a aparecer pra quem ja esta procurando perto. Podemos "
    "trocar uma ideia rapida? posso te mandar um exemplo.'\n\n"

    "PROIBIDO (elimine qualquer uma destas expressoes ou atitude):\n"
    "- 'espero que esteja bem'\n"
    "- 'venho por meio desta'\n"
    "- 'aproveitar esta oportunidade'\n"
    "- 'nao e so X, e Y'\n"
    "- 'revolucionar'\n"
    "- 'solucao comprovada'\n"
    "- 'sem compromisso'\n"
    "- 'voce tem interesse em'\n"
    "- 'ja parou pra pensar'\n"
    "- pergunta retorica falsa ('sabe qual o maior desafio...')\n"
    "- lista de bullets de beneficios\n"
    "- estatistica ou numero magico ('aumenta 3x')\n"
    "- urgencia falsa\n"
    "- mais de 1 emoji\n"
    "- 'prezado'\n"
    "- 'alavancar'\n"
    "- 'especialista em'\n"
    "- 'guru'\n"
    "- elogio generico e vazio ('adorei o trabalho de voces', 'que trabalho incrivel')\n"
    "- autopresentacao pomposa ('sou gestor de growth', 'sou especialista')\n"
    "- travessao (use virgula, parenteses ou ponto)\n"
    "- buzzword ou regra de tres\n"
    "- marcar reuniao ou call de imediato\n"
    "- numero nu (nota, quantidade de avaliacoes: soa raspado)\n\n"

    "Regras: cada mensagem curta (perto de 40 palavras). NUNCA cite numero de avaliacoes "
    "nem nota (soa raspado). NAO se apresente com cargo ('sou especialista', 'sou gestor'). "
    "PROIBIDO travessao: use virgula, parenteses ou ponto. Sem buzzword, sem emoji, sem "
    "regra de tres, sem 'nao e so X, e Y'."
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
        "genuina (nao sabemos a resposta), nunca afirme que eles dependem do iFood."
    ),
    "automacao": (
        "Servico: AUTOMACAO (chatbot/atendimento no WhatsApp). Gancho em volume e "
        "operacao (muito cliente, atende e agenda na mao). Valor: atendimento que "
        "responde e agenda sozinho, sem perder cliente quando esta cheio. Se a "
        "categoria for de agendamento (clinica, salao, barbearia, pet, academia), "
        "pergunte como lidam com a agenda hoje (na mao pelo WhatsApp?)."
    ),
    "ambos": (
        "Servico: TRAFEGO + AUTOMACAO. Lidera com trafego e cita a automacao de "
        "leve no fim como upsell ('e ainda da pra automatizar o atendimento depois')."
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
    "indefinido": (
        "Servico: a definir; lidere com trafego (anuncio local) como padrao."
    ),
}

# profissao do dono -> qual brief de copy usar.
_PROF_TO_BRIEF = {
    "trafego": "trafego", "automacao": "automacao", "ambos": "ambos",
    "design": "design", "web": "design", "branding": "design",
    "marketing": "marketing",
}

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


def build_prompt(lead: Lead) -> str:
    b = lead_brief(lead)
    key = _brief_key(lead)
    sig = getattr(lead, "site_signals", None) or {}
    # contexto pra VOCE, modelo. NAO repita numeros na mensagem (ver regra critica).
    sinais: list[str] = []
    if b["nota"] is not None and b["nota"] >= 4.3:
        sinais.append("boa reputacao no Google (bem avaliado)")
    elif b["nota"] is not None:
        sinais.append("reputacao mediana")
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

    # "Ja anuncia?": define o angulo de trafego (otimizar x comecar). ad_platforms
    # diz EM QUE plataforma. Mantem o angulo condicional do anuncio-sem-site.
    ads = getattr(lead, "ads_active", None)
    plats = sig.get("ad_platforms") or []
    onde = f" ({', '.join(plats)})" if plats else ""
    ja_anuncia = ads is True or bool(plats)
    if ja_anuncia and not b["tem_site"]:
        sinais.append(
            "ja investe em anuncio mas nao tem site pra reter "
            "(paga pra trazer cliente e deixa escapar)"
        )
    elif ja_anuncia:
        sinais.append(f"ja investe em anuncio{onde} (da pra otimizar o que ja roda)")
    elif ads is False:
        sinais.append("nao anuncia ainda (oportunidade de comecar)")

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

    # linha de diagnostico do analista (score_reason.summary), quando disponivel
    reason = getattr(lead, "score_reason", None) or {}
    diagnostico = reason.get("summary") or ""
    diag_linha = (
        f"Diagnostico (base do gancho): {diagnostico}\n\n" if diagnostico else ""
    )

    # o que e tipico da categoria (tag) -> orienta a pergunta da msg1
    cue = _category_cue(b["segmento"])
    cue_linha = f"Tipico da categoria: {cue}.\n" if cue else ""

    ancora = (
        "Ancora obrigatoria: abra a msg1 com UM fato real e especifico deste negocio "
        "(a boa reputacao na regiao, o Instagram parado, a falta de site, o site lento, "
        "o que os clientes valorizam). NUNCA numero cru. Sem um fato concreto, nao escreva."
    )

    return (
        f"{SYSTEM_INSTRUCTION}\n\n"
        f"{_SERVICE_BRIEF.get(key, _SERVICE_BRIEF['indefinido'])}\n\n"
        f"{diag_linha}"
        f"Negocio: {b['nome']} ({b['segmento']}) em {b['cidade']}.\n"
        f"{cue_linha}"
        f"Sinais: {sinais_txt}.\n\n"
        f"{ancora}\n\n"
        'Responda em JSON: {"msg1": "...", "msg2": "..."}'
    )
