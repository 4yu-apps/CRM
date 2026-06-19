# Garimpo · Esteira (Fase 2)

Cascata de enriquecimento em Python. Lê leads `bruto`, processa por fontes
gratuitas e escreve `enriquecido`, gravando **proveniência por campo** e
**match rate**. Roda de graça no cron do GitHub Actions — sem máquina ligada.

A esteira nunca contata ninguém (humano no loop).

## Rodar offline (sem banco)

```bash
cd esteira
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"

# popular alguns leads bruto e enriquecer com fixtures (deterministico)
python -m garimpo_esteira.run seed-demo --sink jsonfile --json /tmp/g.json
python -m garimpo_esteira.run enrich    --sink jsonfile --json /tmp/g.json --sources fixture --delay 0
```

Saída mostra campos preenchidos, match rate e % com telefone (meta ≥80%).

Testes: `python -m pytest` (30 testes, offline).

## Fontes da cascata

| Fonte | Faz | Custo |
|---|---|---|
| **CNPJ** (BrasilAPI) | telefone, e-mail, nome do dono | grátis (núcleo) |
| **Website** | confirma alcance do site; ausência = sinal | grátis |
| **Instagram** | normaliza handle existente | grátis |
| **Meta Ad Library** | "já anuncia?" (sinal, proveniência) | grátis c/ token |

Maps (descoberta) tem o `grid.py` (contorna o teto de ~120 resultados via
subdivisão adaptativa) — lógica pura, usada pela captação.

## Ligar no Supabase

1. Aplique as migrations da Fase 0 (`npm run db:push` na raiz).
2. `cp .env.example .env`, defina `GARIMPO_SINK=supabase` e preencha
   `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OWNER_USER_ID`.
3. `python -m garimpo_esteira.run enrich`

A `service_role` bypassa RLS. A mudança de status usa a RPC `transition_lead`
do banco (valida transição + grava histórico). Em produção roda no
`.github/workflows/esteira.yml` (cron diário) com os mesmos valores em secrets.

## Garantias (critérios de aceite)

- **≥80% com telefone** via CNPJ; meta de nome do dono. ✓
- **Idempotente**: proveniência é upsert; coluna só preenche se vazia; lead já
  enriquecido não volta pro lote. ✓
- **Campo ausente vira vazio, não erro**: fonte instável é ignorada. ✓
- **Rate limit**: lotes + delay entre leads. ✓
- **Custo ~zero**: fontes públicas + cron grátis. ✓

## Arquitetura

```
src/garimpo_esteira/
  models.py        dataclasses (espelham o schema)
  normalize.py     cnpj/telefone/instagram + chave de dedup
  state_machine.py transicoes (espelha o banco)
  grid.py          grade do Maps (teto 120, subdivisao adaptativa)
  validation.py    valida conteudo, nao status HTTP
  match_rate.py    fracao de campos-alvo preenchidos
  sources/         cnpj, website, instagram, ad_library (+ base)
  sink/            jsonfile (offline) | supabase (REST service_role)
  cascade.py       orquestrador (lotes, delays, idempotente)
  run.py           CLI (seed-demo / enrich / counts)
```
