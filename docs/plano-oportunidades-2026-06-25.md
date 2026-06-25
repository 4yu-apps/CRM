# Plano de execução — oportunidades grátis (2026-06-25)

Implementa o que saiu de `docs/oportunidades-pesquisa-2026-06-25.md`, em fases, do maior ROI/menor esforço pro maior esforço. Tudo grátis, nada sai sozinho, multi-serviço.

## Descobertas que mudam o plano (verifiquei o código)

- **O4 (score transparente) JÁ ESTÁ FEITO.** O scorer (`esteira/.../scoring.py`) já devolve `reason.criteria` (`{label, points, note}` por critério); o `score_stage.py` grava em `leads.score_reason` (jsonb); e o front **já exibe** o breakdown na ficha (`ficha/[id]/page.tsx:706`) e na fila (`fila/page.tsx:584`). Não é tarefa — é base. **Qualquer critério novo aparece sozinho aí.**
- **O1 (negócio novo)** é o de maior valor: a BrasilAPI já devolve `data_inicio_atividade`, mas o `cnpj.py` só extrai telefone/email/sócio. Falta capturar a data e somar no score — e o breakdown (O4) mostra de graça.
- **O3 (waterfall CNPJ)** pode estar parcial: já existe a fonte `cnpj_ws` na lista de SOURCES (`models.py`). Confirmar se está ligada como fallback.

---

## FASE 1 — O1 "Negócio novo" (cross-stack · M · maior ROI)

Negócio aberto há pouco quase sempre precisa de marketing/site/tráfego. O dado já vem no enriquecimento; só não é usado.

1. **esteira `sources/cnpj.py`** — capturar `data_inicio_atividade` da resposta da BrasilAPI e emitir como campo gravável (junto de phone/email/owner_name). Normalizar pra `YYYY-MM-DD`.
2. **esteira `models.py`** — `opened_on: str | None = None` no `Lead`; incluir em WRITABLE_FIELDS.
3. **migration** — `alter table leads add column if not exists opened_on date null;` (+ comment). Aditiva e idempotente, no padrão das outras.
4. **esteira `scoring.py`** — novo bloco `_company_age_points(opened_on)` somado nas lentes onde "negócio novo" pesa (trafego, design, marketing):
   - aberto < 6 meses → forte (ex.: +18, "negócio novo, precisa montar presença");
   - 6–18 meses → leve (ex.: +8);
   - > 18 meses ou sem data → 0.
   Entra em `crit` → aparece no breakdown automaticamente.
5. **front** — `Lead` (tipo) + mapeamento do repo ganham `opened_on`; chip "negócio novo" em `lib/quality-signals.ts`/`site-signals.ts` quando recente; opção `empresa_nova` em `SIGNAL_FILTER_OPTIONS` + `matchesSignal` (calcula meses a partir de `opened_on`). Filtro na fila já consome isso.
6. **backfill** — `cmd_backfill` (já existe, idempotente) re-enriquece os leads antigos pra popular `opened_on`.

**Verificação:** testes do scorer (pytest) cobrindo as 3 faixas de idade; lint/tsc front; um lead novo de exemplo mostra o chip + o critério no breakdown.

---

## FASE 2 — O3 waterfall CNPJ + O6 opt-out (robustez & compliance · S–M)

**O3 — fallback de CNPJ grátis.** Confirmar o estado do `cnpj_ws`; garantir a cascata: BrasilAPI → (falha/limite) → CNPJá `/office` público → OpenCNPJ. Registrar a fonte por campo (proveniência já existe via `Finding.source`). Só grátis. Esforço S se já houver a estrutura.

**O6 — não-perturbe (LGPD).** Quando o lead pede pra não receber: marcar `do_not_contact` (schema leve: coluna boolean OU reusar tag/estado) e **travar o recontato** (some da fila, não reaparece na descoberta). Combina com o `sem-whatsapp` que já existe. UI: ação "não perturbar" na ficha/card. Esforço S.

---

## FASE 3 — O2 OpenStreetMap/Overpass (descoberta grátis · M–L · maior ganho de custo)

Corta a dependência do Google Places (pago, teto 25/dia · 1.000/mês).

- **Novo `sources/overpass.py`** — query Overpass por bounding box (cidade/bairro) + categoria/CNAE-equivalente → POIs (nome, lat/lng, e quando houver `phone`/`website`/`opening_hours`). Sem chave, 10k req/dia, dados ODbL (redistribuíveis).
- **Dedup** — cruzar com os leads existentes (Overpass não tem `place_id` do Google; casar por nome normalizado + proximidade de coordenada/endereço) pra não duplicar.
- **Integração** — entra no fluxo de descoberta como fonte primária; o Google Places vira complemento só pro que faltar (ou desligável). Os leads do Overpass seguem pelos motores de enriquecimento grátis que já existem.
- **Ressalva honesta:** cobertura do OSM no Brasil é mais esparsa que na Europa; telefone/site vêm com frequência menor. Por isso é fonte de **descoberta** (volume barato), com enriquecimento depois — não substitui 100% o Places, complementa e baixa o custo.

**Verificação:** dry-run numa cidade (ex.: Maringá) comparando contagem Overpass vs Places; checar dedup; medir quantos vêm com telefone.

---

## FASE 4 — depois (diferenciais · front, sem schema)

- **O5 melhor horário** — sugerir janelas (10–12h, 16–18h) e aprender do histórico de quando cada lead respondeu (`lead_status_history`/`updated_at`). Dica, nunca envio.
- **O7 lookalike** — a partir dos leads `fechado`, destacar ramo/cidade/sinais predominantes e sugerir a próxima busca ("seus clientes que fecham são barbearias em Maringá sem site"). Reusa `buscar`/coverage.

---

## Ordem recomendada

**Fase 1 (O1)** agora — dado quase pronto, valor alto, e estreia de graça no breakdown que já existe. Depois **Fase 2** (robustez/compliance baratos), **Fase 3** (Overpass, o ganho estratégico de custo) e **Fase 4** quando sobrar fôlego. Cada fase: spec curto se precisar, implementação inline, teste onde quebra dado, commit/push/deploy por etapa.
