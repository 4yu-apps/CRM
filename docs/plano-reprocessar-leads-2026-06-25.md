# Plano — reprocessar os leads antigos (opção A) (2026-06-25)

**Para outro agente executar.** Objetivo: os ~2034 leads existentes foram
enriquecidos/pontuados ANTES das fontes e colunas novas (Fases 4-8 + IG + Ad
Library). Hoje têm `opened_on`/`company_status`/`cnpj`/`owner_name`/`lat`/`lng`/
`opening_hours` = praticamente 0, e `score` com a lógica antiga. Este plano
re-enriquece + re-scora os antigos para aplicar tudo que já está no código.

Tudo grátis, online (GitHub Actions), idempotente e resumível. Lê
`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` do `.env` / secrets.

## O que dá e o que NÃO dá pra backfillar
- **Dá** (vêm das fontes de enriquecimento, que re-rodam): `cnpj` (raspado do site)
  → `owner_name`, `opened_on`, `company_status`, `category`(CNAE); métricas do IG
  (`website` da bio, `instagram_engagement`); intensidade de anúncio
  (`ads_count`/`ads_since`); e o **re-score** com os critérios novos.
- **NÃO dá**: `lat`/`lng`/`opening_hours` — vêm da DESCOBERTA (Places/OSM). Re-descobrir
  bate no dedup (409). Só leads NOVOS ganham geo. Não tente re-descobrir.
- Cobertura real depende do dado existir: CNPJ só vem se o site mostrar no rodapé;
  IG só com `@` no lead; ad só com `facebook` resolvível. Lead sem site não ganha cnpj.

## Limites das APIs (free) — definem o lote e o ritmo
| API | uso | limite free | nota |
|---|---|---|---|
| BrasilAPI (CNPJ primário) | cnpj→dono/abertura/situação | sem limite oficial; instável sob carga | manter como primário evita o ReceitaWS |
| ReceitaWS (CNPJ fallback) | só quando BrasilAPI falha | **3 req/min (duro)** | gargalo se virar primário; mantê-lo como reserva |
| Meta Graph (IG Business Discovery + Ad Library) | IG metrics + "já anuncia" | limite por APP (Business Use Case); 429 + header de uso | **gargalo principal**: cada lead = até 1 IG + 1 ad. Token expira 2026-08-24 |
| Website scrape | HTML do site | sem limite de API | timeout 8s/site; ser educado |
| Groq (LLM extract, fallback do scrape) | contato quando regex falha | ~30 req/min | só dispara em lead pobre de contato |
| PageSpeed | perf do site | chave grátis ~25k/dia | folgado |
| Places Details | telefone/site de captura sem fone | **PAGO**, guard 25/dia (Fase 5) | re-enrich quase não usa; NÃO re-descobrir |
| Supabase REST | leitura/escrita | generoso (service_role) | upsert/patch em lote ok |

**Gargalos que mandam no ritmo:** Meta Graph (IG+ad) e ReceitaWS (só fallback).
429 do Meta = falha mole: a fonte engole o erro e devolve vazio → o campo fica
vazio e o **próximo run tenta de novo** (idempotente). Então é seguro rodar em
ondas até cobrir.

## Passo 1 — Construir o comando `reprocess` (esteira)
Novo comando em `esteira/src/garimpo_esteira/run.py` (+ função testável), TDD.
- Pagina os leads (todos, ou os que têm `cnpj is null` / faltam campos novos),
  em páginas de 1000 via PostgREST, com `--offset`/carimbo pra ser resumível.
- Para cada lead: `enrich_lead(lead, build_sources(cfg), sink, advance_status=False)`
  (preenche só campo vazio; NÃO mexe no status).
- **Re-score SEM mudar status** (importante): NÃO usar `score_one` direto (ele chama
  `set_status` e regrediria um `rascunho_pronto`). Em vez disso, igual
  `scripts/rescore_gab.py`: ler a proveniência (ads_active/ads_count/
  instagram_status/instagram_followers/instagram_engagement), montar `signals`,
  chamar `score_lead(...)` e gravar `score`, `score_reason`, `service_target`,
  `suggested_value`/`_reason` via `update_lead_fields` — sem transição.
- Throttle: respeitar `GARIMPO_DELAY` entre leads e `GARIMPO_WORKERS`.
- Reusar o batch de proveniência (`fetch_provenance_many`) pra não cair no N+1.
- Testes: re-enrich preenche campo vazio; re-score atualiza score/reason sem mexer
  no status; idempotente (rodar 2x não duplica). Rodar `pytest` (estava 434 verde).

## Passo 2 — Expor no workflow (online)
Adicionar `reprocess` às opções de `command` no `.github/workflows/esteira.yml`
(workflow_dispatch) e tratar no `run.py` (no bloco do CMD). Reusar os env/secrets
que já estão lá. Não criar workflow novo.

## Passo 3 — Rodar em ondas (respeitando o Meta)
Disparar `command=reprocess` com ritmo suave:
- `GARIMPO_WORKERS=2`, `GARIMPO_DELAY=1.5` (suave pro Meta).
- `GARIMPO_BATCH` ~200-300 por dispatch (ou deixar o comando paginar tudo com
  delay e parar no timeout do Actions, resumindo no próximo).
- Repetir o dispatch até cobrir os 2034 (cada onda pega os que ainda faltam, já que
  é fill-empty + resumível). Se o Meta retornar 429 em massa, baixar o ritmo e
  esperar a janela; o que falhar volta na próxima onda.
- Mantém BrasilAPI como CNPJ primário (não forçar ReceitaWS) pra não bater no 3/min.

## Passo 4 — Verificar
Rodar os counts (com `.env` carregado), esperar > 0 onde havia 0:
```bash
cnt(){ curl -s -I "$SUPABASE_URL/rest/v1/leads?select=id&$1" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "Prefer: count=exact" -H "Range: 0-0" | grep -i content-range; }
cnt 'cnpj=not.is.null'; cnt 'opened_on=not.is.null'; cnt 'company_status=not.is.null'
cnt 'owner_name=not.is.null'
```
`lat`/`lng`/`opening_hours` seguem ~0 (esperado: geo não backfilla). `score_reason`
de um lead reprocessado deve trazer os critérios novos (Idade/Situacao/Engajamento/
"Anuncia? forte"). Build/commit/push do comando novo; deploy do esteira é o push.

## Subagents (pra economizar token)
A execução é I/O em APIs externas com **teto global** (Meta) — paralelizar em N
subagents NÃO acelera além do teto e arrisca 429. Use assim:
- **1 subagent**: constrói + testa o comando `reprocess` (Passo 1-2), TDD.
- **1 subagent**: dispara as ondas, monitora o Actions, re-dispara até cobrir e roda
  a verificação (Passo 3-4).
- Se quiser paralelizar o run: shardar por faixa de `id` em no MÁXIMO 2-3 dispatches
  concorrentes, com `GARIMPO_DELAY` maior, pra soma das chamadas Meta ficar sob o
  teto. Não mais que isso.

## Riscos / garantias
- Idempotente (fill-empty + re-score sem status) → rodar de novo é seguro.
- Não re-descobrir (geo). Não forçar ReceitaWS. Não estourar Places (guard já existe).
- Re-score NÃO pode transicionar status (usar update direto, não `score_one`).
- Token Meta expira 2026-08-24 — fazer antes; depois IG/ad voltam a vir vazios.
