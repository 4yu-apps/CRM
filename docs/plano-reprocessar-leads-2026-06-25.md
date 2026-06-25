# Plano — dados na ficha + reprocessamento dos leads (2026-06-25)

**Para outro agente executar.** Capturamos muito sinal novo (Fases 4-8 + IG + Ad
Library), mas (a) quem LÊ a ficha quase não vê esses dados e (b) os ~2034 leads
antigos foram enriquecidos/pontuados ANTES disso (têm `opened_on`/`company_status`/
`cnpj`/`owner_name`/`lat`/`lng`/`opening_hours` ≈ 0 e `score` com lógica antiga).

## ORDEM (importante)
**Parte 1 (definitivo: capturar+exibir) PRIMEIRO. Parte 2 (reprocessar) DEPOIS.**
Motivo concreto: a frequência de postagem exige um probe novo e a exibição exige
armazenar os dados. Se reprocessar antes, o run não captura/guarda tudo → você
reprocessaria **duas vezes**. Faz o definitivo, reprocessa **uma vez só**.

Tudo grátis, online (GitHub Actions), idempotente. Lê `SUPABASE_URL` +
`SUPABASE_SERVICE_ROLE_KEY` do `.env` / secrets.

---

# PARTE 1 — Dados na ficha + o que o Gemini considera (fazer primeiro)

A MENSAGEM (copy) já está boa. O foco é **dado bruto pro humano** na ficha + ajuste
cirúrgico no Gemini só pra tráfego.

## Respostas diretas (as 3 perguntas)
**1. O que o Gemini CONSIDERA (e sai na msg, que aparece no front):** reputação
(sem número cru), tem site/qualidade (mobile/perf/stack), IG existe/parado,
anuncia?+plataformas, temas de review (elogio), categoria (cue por ramo), nome de
QUEM ENVIA (`sender_name`). **Ajuste novo:** intensidade de anúncio (N anúncios /
desde quando) **só quando o alvo é tráfego/ambos** (é o gestor de tráfego que liga
pra isso). NÃO usa nome do dono (não saudar pela pessoa) nem número cru de seguidores.

**2. O que vem BRUTO (sem Gemini), direto no painel da ficha:** nº de seguidores,
frequência de postagem + última postagem, nota, nº de avaliações, nº de anúncios +
desde quando + plataformas, negócio novo (data de abertura), situação cadastral,
horário de funcionamento, dono (anotado), sinais técnicos do site, lat/lng (mapa).
São FATOS exibidos, sem IA.

**3. Tudo importante já está no front? NÃO.** Hoje a ficha mostra só `owner_name`
+ breakdown + chips do site. Falta o painel de dados brutos (abaixo) e o tipo Lead
do front nem tem os campos novos (followers/engagement/ads_count/opening_hours...).

## A fazer
### A. owner_name (dado sensível) — só ANOTAR, não alimentar o Gemini
Exibir na ficha (já exibe "Dono / responsável"). **NÃO** mandar pro Gemini saudar
pela pessoa: o CNPJ traz o sócio, mas não garante que é ele falando, e usar dado
sensível pode incomodar. Confirmar que `build_prompt` NÃO usa owner_name (hoje não
usa — manter assim).

### B. IG: frequência de postagem (DADO pro humano)
O probe (`sources/instagram.py`) já puxa `media.limit(5){timestamp,...}`. Subir pra
`limit(12)` (mesma 1 chamada, sem custo extra) e derivar, além do `last_post`:
- `post_freq` (posts/semana na janela dos últimos posts) e
- `post_freq_label` legível: "≈3x/semana", "≈1x/mês", "postou recentemente",
  "parado há ~2 meses". (Não precisa virar pontuação; o LABEL basta pro humano.)
Emitir junto de `followers`/`engagement`.

### C. Armazenar pra exibir: jsonb `social_signals` (espelha o site_signals)
1 migration: coluna `social_signals jsonb` (cascade always-update, igual
site_signals). Conteúdo: {followers, media_count, last_post, post_freq,
post_freq_label, engagement, ig_status, ads_active, ads_count, ads_since,
ad_platforms}. Assim o front monta o painel de um campo só.
Alternativa zero-migration: o front já carrega proveniência → montar o painel
lendo de lá (mais trabalho no front; o jsonb é mais limpo).

### D. Front: tipo Lead + painel "Sinais do lead" (DADOS, sem IA)
- Tipo Lead (`front/src/lib/types.ts`): adicionar os campos (ou `social_signals`).
- Painel agrupado na ficha (reusar o padrão de chips de `lib/site-signals.ts` + DataRow):
  - **Reputação:** nota, nº avaliações.
  - **Social:** seguidores, frequência + última postagem, IG ativo/parado, canais extras.
  - **Anúncio:** anuncia?, N anúncios, desde quando, plataformas.
  - **Negócio:** data de abertura (negócio novo), situação cadastral, categoria/CNAE, horário.
  - **Contato:** dono (anotado), telefone/WhatsApp, email, site.
  - **Mapa:** lat/lng (opcional, fase visual depois).

### E. Gemini (msg já boa) — ajuste cirúrgico, baixa prioridade
- Alimentar `ads_count`/`ads_since` no `build_prompt` SÓ no lens tráfego/ambos.
- `instagram_status=parado` está no exemplo do prompt mas NÃO é alimentado como
  sinal → passar (já temos o dado). Manter sem nome do dono e sem número cru.

## Verificação (Parte 1)
- Ficha de lead com IG mostra seguidores + frequência; lead que anuncia mostra N
  anúncios + desde quando; negócio novo aparece como fato. Tudo SEM IA.
- `pytest` verde (probe freq + social_signals). Front `tsc`/`lint`/`build` ok.

---

# PARTE 2 — Reprocessar os leads antigos (rodar por último)

Depois da Parte 1, re-enriquece + re-scora os ~2034 pra aplicar tudo (e cair num
sistema que já lê/exibe). Idempotente e resumível.

## O que dá e o que NÃO dá pra backfillar
- **Dá** (fontes de enriquecimento re-rodam): `cnpj` (raspado do site) → `owner_name`,
  `opened_on`, `company_status`, `category`(CNAE); métricas do IG (`website` da bio,
  engajamento, frequência); intensidade de anúncio; e o **re-score**.
- **NÃO dá**: `lat`/`lng`/`opening_hours` — vêm da DESCOBERTA (Places/OSM); re-descobrir
  bate no dedup (409). Só leads NOVOS ganham geo. Não re-descobrir.
- Cobertura depende do dado existir: CNPJ só se o site mostrar no rodapé; IG só com
  `@`; ad só com `facebook` resolvível. Lead sem site não ganha cnpj.

## Limites das APIs (free) — definem o lote e o ritmo
| API | uso | limite free | nota |
|---|---|---|---|
| BrasilAPI (CNPJ primário) | cnpj→dono/abertura/situação | sem limite oficial; instável sob carga | manter primário evita o ReceitaWS |
| ReceitaWS (CNPJ fallback) | só quando BrasilAPI falha | **3 req/min (duro)** | mantê-lo como reserva |
| Meta Graph (IG + Ad Library) | IG metrics + "já anuncia" | limite por APP (BUC); 429 + header de uso | **gargalo principal**: até 1 IG + 1 ad por lead. Token expira 2026-08-24 |
| Website scrape | HTML do site | sem limite de API | timeout 8s/site |
| Groq (LLM extract) | contato quando regex falha | ~30 req/min | só em lead pobre de contato |
| PageSpeed | perf do site | chave grátis ~25k/dia | folgado |
| Places Details | telefone/site de captura sem fone | **PAGO**, guard 25/dia (Fase 5) | re-enrich quase não usa; NÃO re-descobrir |
| Supabase REST | leitura/escrita | generoso (service_role) | em lote ok |

**Gargalos do ritmo:** Meta Graph (IG+ad) e ReceitaWS (só fallback). 429 do Meta =
falha mole: a fonte engole e devolve vazio → campo fica vazio e o **próximo run
tenta de novo** (idempotente). Seguro rodar em ondas até cobrir.

## Passos
1. **Comando `reprocess`** (`run.py` + função testável, TDD): pagina os leads (1000/
   página via PostgREST, resumível por offset/carimbo); por lead
   `enrich_lead(..., advance_status=False)` (preenche campo vazio, NÃO mexe no status);
   **re-score SEM mudar status** — NÃO usar `score_one` (ele chama `set_status` e
   regrediria um `rascunho_pronto`); igual `scripts/rescore_gab.py`: ler proveniência
   (ads_active/ads_count/instagram_*), montar `signals`, `score_lead(...)` e gravar
   `score`/`score_reason`/`service_target`/`suggested_value` via `update_lead_fields`.
   Reusar `fetch_provenance_many` (sem N+1).
2. **Expor no workflow:** adicionar `reprocess` às opções de `command` do
   `.github/workflows/esteira.yml` e tratar no `run.py`. Não criar workflow novo.
3. **Rodar em ondas:** `GARIMPO_WORKERS=2`, `GARIMPO_DELAY=1.5` (suave pro Meta),
   `GARIMPO_BATCH` ~200-300/dispatch. Repetir até cobrir (cada onda pega o que falta).
   Manter BrasilAPI primário (não forçar ReceitaWS 3/min).
4. **Verificar:** counts com `.env` carregado, esperar > 0 onde havia 0:
```bash
cnt(){ curl -s -I "$SUPABASE_URL/rest/v1/leads?select=id&$1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range; }
cnt 'cnpj=not.is.null'; cnt 'opened_on=not.is.null'; cnt 'owner_name=not.is.null'
```
`lat`/`lng`/`opening_hours` seguem ~0 (esperado). `score_reason` de um lead
reprocessado traz os critérios novos (Idade/Situacao/Engajamento/"Anuncia? forte").

## Subagents (economizar token)
A execução é I/O em APIs com **teto global** (Meta) — paralelizar em N subagents NÃO
acelera além do teto e arrisca 429. Use: **1 subagent** constrói+testa o `reprocess`;
**1 subagent** dispara as ondas, monitora o Actions e roda a verificação. Se quiser
paralelizar o run: shardar por faixa de `id` em no MÁX 2-3 dispatches concorrentes
com `GARIMPO_DELAY` maior. Não mais que isso.

## Riscos / garantias
- Idempotente (fill-empty + re-score sem status) → rodar de novo é seguro.
- Não re-descobrir (geo). Não forçar ReceitaWS. Não estourar Places (guard existe).
- Re-score NÃO pode transicionar status (update direto, não `score_one`).
- Token Meta expira 2026-08-24 — fazer antes; depois IG/ad voltam a vir vazios.
