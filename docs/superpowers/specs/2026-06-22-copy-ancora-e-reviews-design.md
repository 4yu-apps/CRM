# Copy com âncora (Analista→Redator) + source de reviews

Data: 2026-06-22

## Origem

O cowork (chat de prospecção) descreveu o conceito de "pontos de conexão →
análise → redação" pra matar a copy genérica. Auditoria: nossa esteira já é esse
pipeline (sources = coleta, scoring = analista rule-based, draft = redator). Duas
melhorias valem: (A) ligar o analista no redator de verdade e travar a âncora;
(B) coletar o teor das avaliações como ponto de conexão novo.

Decisão do dono: tudo dentro do nosso CRM, nenhuma IA de fora.

## Pesquisa (Places API New, Place Details)

- **Teor das reviews**: disponível. `places.googleapis.com/v1/places/{id}` com
  FieldMask `reviews` devolve até 5 reviews (`text`/`originalText`, `rating`,
  `authorAttribution`, `publishTime`, `relativePublishTimeDescription`).
- **"Dono responde avaliações?"**: NÃO obtível pra terceiro. Só via Google
  Business Profile API v4, que exige OAuth do dono da ficha. **Largado** (mesmo
  caso do iFood: não dá de forma honesta e automática).
- **Custo**: Place Details com `reviews` cai no SKU Enterprise+Atmosphere, mais
  caro que Text Search, sem free tier permanente confirmado. Logo: reviews só
  rodam em lead QUALIFICADO (volume baixo, custo controlado) e OFF por default.

## Etapa A — Analista→Redator + âncora (grátis)

O `scoring.score_lead` já produz `score_reason.summary` (o gargalo + ângulo em
PT) e os `criteria` vencedores. Hoje o `draft/prompt.py` ignora isso. Mudança:

1. `build_prompt(lead)` passa a ler `lead.score_reason`:
   - injeta o `summary` como "Diagnóstico (base do gancho)".
   - usa o critério de maior peso como reforço do sinal-âncora.
2. Regra da âncora no SYSTEM_INSTRUCTION: msg1 abre ancorando em UMA observação
   real e específica do negócio (reputação boa na região, Instagram parado, sem
   site, o que os clientes elogiam). NUNCA número cru (já proibido; reforça).
   Sem sinal concreto, a abertura fica vaga, e isso é proibido.
3. Dois ângulos condicionais afiados (a partir de lead + signals):
   - `ads_active` verdadeiro + sem site => "paga pra trazer cliente e deixa
     escapar" (falta onde reter).
   - nota alta (>=4.5) + volume alto (>=150) + (sem site ou sem Instagram) =>
     "base fiel grande, mas tem cliente que não te acha / não rechama".

Sem mudança no scoring; só o redator passa a usar o que o analista já decidiu.

## Etapa B — source de reviews (custa, gated)

`sources/reviews.py`, offline-first, espelhando o padrão das outras fontes:

- Fetch injetável. Real: Place Details (New) por `maps_place_id`, FieldMask
  `reviews`, devolve até 5 reviews (texto + nota).
- Resumo do teor via Groq (grátis, já temos `extract_llm`/openai_compat): destila
  as reviews em `{elogio, reclamacao, resumo}` curto, pt-BR, sem número. Falha do
  LLM => guarda só o texto cru das reviews como amostra.
- Emite finding `review_themes` (JSON) na proveniência. O draft usa como âncora
  humana ("vi que o pessoal elogia muito o atendimento").
- NÃO emite "responde avaliações" (não obtível).

### Gating de custo (crítico)

Place Details é SKU caro. A source NÃO entra na cascata de enriquecimento (que
roda em todo lead bruto). Roda só em lead QUALIFICADO, antes do rascunho, e só
quando ligada por flag `GARIMPO_REVIEWS=1` (default OFF). Assim o custo fica em
dezenas de chamadas/dia, não milhares.

Envs: `GARIMPO_REVIEWS` (0/1, default 0), reusa `GOOGLE_MAPS_API_KEY` e o Groq já
configurado.

## Arquivos

Etapa A:
- `esteira/src/garimpo_esteira/draft/prompt.py` — consome score_reason + âncora
- `esteira/tests/test_draft.py` (ou novo) — âncora obrigatória, usa diagnóstico

Etapa B:
- `esteira/src/garimpo_esteira/sources/reviews.py` — novo
- `esteira/src/garimpo_esteira/sources/__init__.py` — exporta
- `esteira/src/garimpo_esteira/config.py` — flag + wiring (qualificado-only)
- `esteira/tests/test_reviews_source.py` — novo
- `esteira/.env.example` — documenta a flag e o custo

## Fora de escopo (YAGNI)

- "Responde avaliações?" (não obtível pra terceiro).
- Reviews na cascata de todo lead (custo). Só qualificado, opt-in.
- Terceira etapa de revisão/variação de copy (over-engineering; 2 etapas pegam
  quase todo o ganho).
- Trocar o analista rule-based por LLM (downgrade: perde grátis/explicável).
