# Plano pós-auditoria — Fases 4 a 8 (2026-06-25)

Sai da varredura do pipeline de descoberta/enriquecimento. Tudo grátis salvo onde
marcado. Ritmo: TDD (pytest), build/commit/push, deploy manual (esteira via cron
do GitHub Actions no push; front na Vercel), db push quando houver migration.

## Cenário
- Feito: O1 (negócio novo), O2 (Overpass), O3 (waterfall CNPJ), O6 (não perturbar).
- Token Meta validado (Ad Library `ads_active` live; expira 2026-08-24). IG metrics
  bloqueado (falta `INSTAGRAM_BUSINESS_ID`, dono validando a API).
- Places primário, Overpass opcional. Repo público (chave só em .env/secrets).

## Fase 4 — Destravar a cadeia CNPJ (grátis, maior ROI) — FEITA
Antes: `owner_name`/`opened_on`(O1)/situação só funcionavam pra lead que já tinha
CNPJ (quase nenhum de Maps/OSM). Agora:
- `extract_cnpj` no website (padrão formatado XX.XXX.XXX/XXXX-XX) → emite CNPJ.
- `build_sources` reordenado: WebsiteSource antes do CnpjSource → o CNPJ raspado
  destrava dono/data/situação no MESMO passo (antes do score).
- CnpjSource captura `company_status` (situação cadastral) e `category` (CNAE).
- Score: empresa não-ATIVA (BAIXADA/INAPTA/SUSPENSA/NULA) = corte duro.
- Migration `leads.company_status`.

## Fase 5 — Guardrails de custo (grátis, protege fatura)
- Teto diário/mensal no Places Text Search (hoje sem contador; é o gasto pago
  menos guardado), espelhando o do Places Details.
- Contar Reviews no orçamento Places (ou manter travado).

## Fase 5.5 — CNPJ por nome (reverso) com validação cruzada
Quando o lead não tem CNPJ (sem site, ou site sem CNPJ), acha o CNPJ por
nome+cidade e valida cruzando. Roda na cascata entre Website e CnpjSource; pula
se o site já deu CNPJ. Só descobre o CNPJ; BrasilAPI/ReceitaWS confirmam o resto.

- **5.5a (FEITA):** `pick_cnpj` (validador precision-first: telefone forte; sem
  telefone exige cidade+bairro/rua+nome alto; só aceita se 1 único CNPJ passa,
  senão vazio) + `CnpjNameSource` (gated, teto por-run) + enum `cnpj_lookup` +
  wiring. Provider injetável. **Adapter casadosdados bateu em Cloudflare 403** (não
  roda headless) → fonte nasce gated-off; o validador/source são o que vale.
- **5.5b (FEITA — máquina; dados = operação do dono):** Dados Abertos da Receita.
  Tabela `receita_estabelecimento` no Supabase + pg_trgm + RPC `receita_search`
  (migration aplicada). Provider `receita_lookup_factory` (cron consulta a RPC,
  grátis/robusto) + seleção `GARIMPO_CNPJ_LOOKUP_PROVIDER=receita` (default).
  Loader `scripts/load_receita.py` (+ helpers puros testados em `receita_load.py`)
  filtra os municípios prospectados e faz upsert. **Pendente do dono:** baixar os
  zips da Receita e rodar o loader local (≈15GB, fora do cron); depois ligar
  `GARIMPO_CNPJ_LOOKUP=1`. Sem dados carregados, a fonte não acha nada (inerte).

## Fase 6 — Ad Library: bool → intensidade (FEITA, grátis)
- `has_ads_info` captura nº de anúncios ativos + desde quando. Probe devolve dict
  {active,count,since}; source emite ads_count/ads_since (proveniência); ainda
  aceita probe bool (legado). Score trafego usa ads_count: anuncia forte (≥5) = 4
  "foco em otimização"; leve = 6; não anuncia = 15. Sem migration. Token expira
  2026-08-24.

## B6 — Instagram metrics (FEITA, grátis; IG validado)
- Probe Business Discovery pega bio, website e engajamento (média like+coment dos
  últimos posts) na mesma chamada. Source emite `website` (enriquecível) + sinal
  `instagram_engagement`. Score marketing: critério "Engajamento" por taxa
  (interações/seguidores): <1% parada (12, oportunidade), 1-3% (6), >3% saudável
  (2). Secrets INSTAGRAM_BUSINESS_ID + INSTAGRAM_TOKEN no esteira.yml. Sem migration.

## Fase 7 — Geo & dedup (FEITA, grátis)
- Colunas `lat`/`lng` gravadas no `result_to_lead` (Places e OSM já retornavam;
  antes jogados fora). `opening_hours` capturado do OSM (base pro "melhor horário").
- Dedup cross-fonte: coluna gerada `geo_dedup_key` (nome normalizado + coord ~111m)
  + índice único → o mesmo negócio achado por Places e OSM deduplica no insert (409).
- Migration `20260625120600`. Front ainda não exibe mapa/horário (feature futura).

## Fase 8 — Performance (FEITA, grátis)
- Batch da proveniência no score: `fetch_provenance_many` (1 chamada p/ o lote) +
  `score_one(prov=)`; `score_batch` faz prefetch → corta o N+1.
- Índices `service_target/score/assigned_to/tags` (migration `20260625120700`;
  assigned_to/tags já existiam → skip idempotente).
- Não feito (menor ROI/mais risco): round-trip duplo do backfill, staleness no scrape.

## (Desbloqueado) IG metrics — feito na B6 acima.

## Notas honestas
- CNPJ do site só pega quem publica CNPJ no rodapé (muitos publicam; nem todos).
  Sem site, sem CNPJ → cadeia segue dependendo de extensão/manual.
- IG-bio como fonte de CNPJ fica pra quando o IG metrics ligar.
