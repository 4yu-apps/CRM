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

## Fase 6 — Ad Library: bool → intensidade (grátis, token live)
- Capturar nº de anúncios ativos + desde quando + plataformas → intensidade no
  lens trafego. Token Meta já validado (renovar antes de 2026-08-24).

## Fase 7 — Geo & dedup (grátis, médio esforço)
- Colunas `lat`/`lng` + gravar no `result_to_lead` (Places e OSM já retornam).
- Capturar `opening_hours` (grátis do OSM) → alimenta O5 depois.
- Dedup cross-fonte (Places × OSM) por nome normalizado + raio de coordenada.

## Fase 8 — Performance (grátis, conforme escala)
- Batch da proveniência no score (corta N+1); cortar round-trip duplo do backfill;
  índices `service_target/score/assigned_to/tags`; staleness no scrape.

## Parado (bloqueado na API do IG)
- IG metrics: bio + site + verificado + seguidores/engajamento no lens marketing.
  Liga com `INSTAGRAM_BUSINESS_ID`. Fase curta quando a API for validada.

## Notas honestas
- CNPJ do site só pega quem publica CNPJ no rodapé (muitos publicam; nem todos).
  Sem site, sem CNPJ → cadeia segue dependendo de extensão/manual.
- IG-bio como fonte de CNPJ fica pra quando o IG metrics ligar.
