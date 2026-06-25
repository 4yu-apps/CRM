# Garimpo · Esteira (Fases 2 e 3)

Cascata em Python que descobre e leva o lead até o `rascunho_pronto`, sozinha:

```
(Maps) ──discover──▶ bruto ──enrich──▶ enriquecido ──score──▶ qualificado ──draft──▶ rascunho_pronto
                                                          └──▶ descartado
```

- **enrich** (Fase 2): fontes gratuitas preenchem campos + proveniência + match rate.
- **score** (Fase 3): regras puras do ICP → score explicável + qualifica/descarta.
- **draft** (Fase 3): IA escreve as 2 mensagens (mock offline ou Gemini).

Roda de graça no cron do GitHub Actions. A esteira **nunca contata ninguém**
(humano no loop): só deixa o rascunho pronto pro humano aprovar e enviar.

## Rodar offline (sem banco)

```bash
cd esteira
python3 -m venv .venv && . .venv/bin/activate
pip install -e ".[dev]"

# descobrir leads (Maps fixture) + rodar o pipeline inteiro com copy mock
python -m garimpo_esteira.run discover --sink jsonfile --json /tmp/g.json --maps fixture --terms "pizzaria,barbearia"
python -m garimpo_esteira.run pipeline --sink jsonfile --json /tmp/g.json --sources fixture --llm mock --delay 0
```

Estágios também rodam soltos: `discover`, `enrich`, `score`, `draft`. Saída
mostra inseridos/dedup, campos preenchidos, % com telefone (meta ≥80%),
score/decisão e os rascunhos.

Testes: `python -m pytest` (49 testes, offline).

## Fontes da cascata

| Fonte | Faz | Custo |
|---|---|---|
| **CNPJ** (BrasilAPI) | telefone, e-mail, nome do dono | grátis (núcleo) |
| **Website** | confirma alcance do site; ausência = sinal | grátis |
| **Instagram** | normaliza handle existente | grátis |
| **Meta Ad Library** | "já anuncia?" (sinal, proveniência) | grátis c/ token |

### Meta Ad Library — token, cobertura e o que NÃO fazer

O sinal "já anuncia?" usa a Ad Library API por `search_page_ids` (confiável). O
token (`META_AD_LIBRARY_TOKEN`) é um user token de longa duração (60 dias),
gerado pela troca `fb_exchange_token`; renovar antes de expirar. Vive no `.env`
local e no secret do GitHub Actions (o cron lê de lá). App Meta: `claude-garimpo`.

Cobertura: só resolve quando o facebook do lead já é **page_id numérico**. Quando
vem como **slug** (`facebook.com/nomedaloja`), resolver slug→id exige
`pages_read_engagement` / **Page Public Content Access (PPCA)** — sem isso a fonte
devolve `None` (desconhecido, nunca falso-positivo).

**NÃO pedir PPCA por app review para este projeto.** Investigado e descartado:

1. O único uso permitido do PPCA é "analisar e/ou exibir publicações e interações
   nas Páginas". Resolver id para checar anúncio (prospecção) não é isso →
   rejeição quase certa.
2. Os Platform Terms da Meta proíbem montar base/serviço de prospecção sobre dado
   da plataforma e transferir dado coletado a terceiros.
3. O app que pediria o PPCA é o **mesmo** que carrega o token do Ad Library já
   funcionando; um caso de uso de prospecção rejeitado pode sinalizar/derrubar o
   app e quebrar o motor que já roda.

Lead com slug fica neutro de propósito. Brecha futura de baixa prioridade:
scraping **deslogado** do page_id (decisão *Meta v. Bright Data*, jan/2024, fora
dos Termos) — mas bate em login wall, exige browser headless e é frágil; contra a
regra offline-first. Não vale agora.

Maps (descoberta) tem o `grid.py` (contorna o teto de ~120 resultados via
subdivisão adaptativa) — lógica pura, usada pela captação.

## Score (Fase 3) — regras puras do ICP

Sem LLM: determinístico, explicável (`score_reason` guarda cada critério e
seus pontos), de graça. Corte em 50/100. Critérios: nota (4,3+), volume de
avaliações (80–800), descuido digital (sem site/IG = ouro), "já anuncia?", e
contato (sem telefone = descarte automático — não dá pra falar no WhatsApp).

## Rascunho (Fase 3) — copy das 2 mensagens

Provider trocável por `GARIMPO_LLM`: `mock` (template offline, R$0) ou
`gemini` (free tier Flash, ~1.500 req/dia). Fluxo de 2 mensagens (abertura →
pitch), personalizado pelos sinais. **Nunca envia.** Respeita opt-out (LGPD):
lead opt-out não recebe rascunho de contato.

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
  discovery.py     captacao Maps -> bruto (fixture | places), dedup por place_id
  scoring.py       regras ICP puras -> score + score_reason explicavel
  sources/         cnpj, website, instagram, ad_library (+ base)
  draft/           mock | gemini (+ prompt, base)
  sink/            jsonfile (offline) | supabase (REST service_role)
  cascade.py       enrich   (bruto -> enriquecido)
  score_stage.py   score    (enriquecido -> qualificado/descartado)
  draft_stage.py   draft    (qualificado -> rascunho_pronto)
  run.py           CLI (discover / enrich / score / draft / pipeline / counts)
```
