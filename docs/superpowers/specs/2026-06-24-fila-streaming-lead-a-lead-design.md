# Fila streaming lead-a-lead (pipeline da esteira)

**Data:** 2026-06-24
**Status:** aprovado — pronto para plano de implementação

## Problema

A tela "Buscar" descobre ~20 negócios em segundos, mas a fila de leads
(`status = rascunho_pronto`) só começa a encher minutos depois — tudo de uma vez,
no fim. Numa busca real medida (conta yamamotoduarte, nicho "Academia em São Paulo, SP"):

```
11:24:04–11:24:20  busca → 20 negócios inseridos (status bruto)   [~16s]
11:30:58           enriquecimento dos 20 concluído                [+6min38s]
11:33:10           últimos rascunhos gerados (entram na fila)      [~9min total]
```

O usuário esperou ~9 minutos sem ver nenhum lead na fila. Ruim para a experiência.

### Causa raiz

O pipeline roda em **paredes sequenciais por estágio**, não por lead
(`cmd_search`, `run.py:205-212`):

```
discover()      → todos os 20 viram bruto
enrich_batch()  → processa TODOS os 20 → enriquecido   (gargalo: ~6min, HTTP externo por lead)
score_batch()   → processa TODOS os 20 → qualificado | descartado
draft_batch()   → processa TODOS os 20 → rascunho_pronto  ← fila só enche AQUI, no fim
```

A fila é o último estágio. Nenhum lead aparece até o enrich+score de todos terminar
e o draft começar.

### Fragilidade latente (encontrada na investigação)

`enrich_batch` isola erro **por lead** (`cascade.py:82-88`). Mas:

- `score_batch` (`score_stage.py:73`) é list-comprehension, **sem** try/except por lead.
- `draft_batch` (`draft_stage.py:96-99`) faz loop **sem** try/except por lead.

A cadeia do provider (`draft/fallback.py:18-25`) engole erro de LLM e cai no mock,
então `draft_one` quase nunca estoura — por isso não houve strand permanente no caso
investigado (os "4 presos" eram o draft ainda rodando; resolveu sozinho). Mas um erro
de rede no `update_lead_fields`/`set_status` dentro de `score_one`/`draft_one` derruba
o lote inteiro e abandona o resto em `enriquecido`/`qualificado` até o próximo cron.
A redesign fecha essa fragilidade de graça (try/except por lead).

## Objetivo

Fazer a fila encher **lead-a-lead**: cada negócio descoberto passa por
enrich → score → draft individualmente e cai na fila assim que fica pronto,
em vez de esperar o lote todo. Aplicar a `cmd_search` (botão "Buscar agora")
e ao `autopilot` (cron). Fechar a fragilidade de erro não isolado.

### Não-objetivos (specs separados)

- **B — paralelizar HTTP do enrich.** Corta o tempo *por lead* (~15-20s → menos),
  mas não é o que faz a fila encher 1-a-1. Frente separada.
- **C — tela superadmin de logs cross-user.** Peça maior (front + API admin). Spec próprio.

### Limite honesto do que A entrega

A **não** mexe no cold-start do GitHub Actions (~30s) nem no tempo de enrich por lead
(~15-20s: HTTP de site + PageSpeed). Então o 1º lead aparece na fila ~45-60s após o
clique, depois +~15-25s a cada lead. É uma melhora enorme sobre "9 min para ver
qualquer coisa", mas não é instantâneo. O instantâneo depende de B.

## Design

### Novo módulo: `esteira/src/garimpo_esteira/pipeline_stream.py`

Reaproveita as funções por-item que já existem e já gravam no banco por lead
(`enrich_lead`, `score_one`, `draft_one`). Muda só a **ordem de orquestração**:
de "estágio-major" (todos no enrich, depois todos no score…) para "lead-major"
(um lead inteiro por vez).

```python
def process_one_lead(
    lead, sources, provider, sink, *,
    profession=None, min_score=0, reviews_source=None,
) -> dict:
    """Roda enrich → score → draft para UM lead. Idempotente (os guards de
    status em enrich_lead/score_one/draft_one já evitam reprocessar/retroceder).
    Retorna {"enriched": bool, "discarded": bool, "drafted": bool}."""
    enrich_lead(lead, sources, sink)              # bruto → enriquecido
    result = score_one(lead, sink, profession, min_score)  # → qualificado | descartado
    drafted = False
    if result.decision == "qualificado":
        if draft_one(lead, provider, sink, profession, reviews_source=reviews_source):
            drafted = True                        # → rascunho_pronto (na fila AGORA)
    return {
        "enriched": True,
        "discarded": result.decision == "descartado",
        "drafted": drafted,
    }


def run_pipeline_streaming(
    sink, sources, provider, *,
    batch=20, delay=0.0, owner_id=None,
    profession=None, min_score=0, reviews_source=None,
) -> dict:
    """Busca leads 'bruto' (ordem de descoberta: created_at.asc) e processa cada
    um por inteiro, com try/except POR LEAD — um lead que estoura não derruba os
    demais. Acumula contagens e emite no fim os MESMOS eventos de atividade de
    hoje (enriquecimento / descarte / rascunho) com os totais, preservando o feed
    da home. Retorna as contagens."""
    leads = sink.fetch_by_status("bruto", batch, owner_id)
    counts = {"enriched": 0, "discarded": 0, "drafted": 0}
    for i, lead in enumerate(leads):
        try:
            r = process_one_lead(
                lead, sources, provider, sink,
                profession=profession, min_score=min_score, reviews_source=reviews_source,
            )
            for k in counts:
                counts[k] += int(r[k])
        except Exception:
            pass  # lead ruim fica no status atual; próximo run retenta (idempotente)
        if delay and i < len(leads) - 1:
            time.sleep(delay)
    _log_pipeline_activity(sink, owner_id or (leads[0].owner_id if leads else ""), counts)
    return counts
```

`_log_pipeline_activity` emite os 3 eventos existentes (mesmo texto/`tipo`/`ref_count`
de hoje) condicionados às contagens — feed da home inalterado.

**Trade-off do feed:** os eventos de atividade ainda aparecem no fim (contagem
agregada), igual hoje. O que muda — e é o pedido — é a **fila** (`rascunho_pronto`),
que enche durante o loop. Log por-lead foi descartado (poluiria o feed; YAGNI).

### Integração

**`cmd_search` (`run.py:210-212`):** troca as 3 chamadas batch por uma:

```python
# antes: enrich_batch(...); score_batch(...); draft_batch(...)
run_pipeline_streaming(
    sink, sources, provider,
    batch=cfg.batch, delay=cfg.delay, owner_id=owner_id,
    profession=profession, min_score=min_score, reviews_source=reviews_source,
)
```

**`autopilot.py:177-185`:** troca o loop de 3 lambdas por `run_pipeline_streaming`
para os leads novos (`bruto`), **mais um mop-up barato** ao final para recuperar
stragglers deixados em `enriquecido`/`qualificado` por algum run anterior
interrompido:

```python
try:
    run_pipeline_streaming(sink, sources, provider, batch=batch, delay=delay,
                           owner_id=owner, profession=profession, min_score=min_score,
                           reviews_source=reviews_source)
    # mop-up: termina quem ficou no meio em run anterior (normalmente vazio = no-op)
    score_batch(sink, batch=batch, owner_id=owner, profession=profession, min_score=min_score)
    draft_batch(sink, provider, batch=batch, owner_id=owner, profession=profession,
                reviews_source=reviews_source)
except Exception:
    pass
```

`cmd_search` não precisa do mop-up: na busca manual todos os leads começam em `bruto`;
um straggler raro é recuperado pelo cron do autopilot (a cada 2h).

### Idempotência / recuperação

- `enrich_lead` (`cascade.py:62-65`), `score_one` (`score_stage.py:63`) e
  `draft_one` (`draft_stage.py:42`) só fazem `set_status` quando o status muda —
  reprocessar é seguro, não retrocede.
- Falha no meio de um lead: o que já avançou fica gravado; o lead para no status
  atual; o próximo run (mop-up do autopilot ou os crons redraft/backfill existentes)
  termina. Sem strand permanente.

## Arquivos tocados

| Arquivo | Mudança |
|---|---|
| `esteira/src/garimpo_esteira/pipeline_stream.py` | **novo** — `process_one_lead`, `run_pipeline_streaming`, `_log_pipeline_activity` |
| `esteira/src/garimpo_esteira/run.py` | `cmd_search` usa `run_pipeline_streaming` |
| `esteira/src/garimpo_esteira/autopilot.py` | per-owner usa `run_pipeline_streaming` + mop-up |
| `esteira/tests/test_pipeline_stream.py` | **novo** — testes (abaixo) |

Sem mudança de schema, de front, nem do workflow GHA. `enrich_batch`/`score_batch`/
`draft_batch` continuam existindo (usados pelo mop-up, pelos comandos CLI avulsos
`enrich`/`score`/`draft`/`pipeline` e pelos testes existentes).

## Testes (`test_pipeline_stream.py`)

Reusa fakes/fixtures dos testes atuais (`test_pipeline.py`, `test_autopilot.py`,
`test_cascade.py`): fake sink em memória, sources fixture, provider mock.

1. **Progressão por-lead:** N leads `bruto` → cada um termina em `rascunho_pronto`
   ou `descartado`; nenhum fica em `bruto`/`enriquecido`/`qualificado`.
2. **Streaming de verdade:** um sink que registra a ordem das transições prova que
   o lead #1 chega a `rascunho_pronto` **antes** de o lead #2 começar o enrich
   (ordem lead-major, não estágio-major).
3. **Isolamento de erro:** um lead que faz `process_one_lead` estourar (ex.: source
   ou sink que levanta exceção nesse lead) **não** impede os demais de chegarem à fila.
4. **Contagens / feed:** `run_pipeline_streaming` retorna contagens corretas e
   dispara os eventos de atividade certos (`enriquecimento`/`descarte`/`rascunho`)
   com os `ref_count` certos.
5. **Idempotência:** rodar duas vezes não duplica nem retrocede status.

Rodar a suíte inteira da esteira para garantir que nada existente quebrou.

## Critérios de aceite

- Busca manual: a fila (`rascunho_pronto`) cresce incrementalmente durante o
  processamento, não tudo de uma vez no fim.
- Um lead com erro não impede os outros de entrarem na fila.
- Feed da home inalterado (mesmos eventos, mesmos textos/contagens).
- Suíte de testes da esteira verde.
