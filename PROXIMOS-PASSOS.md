# CRM | 4YUmkt — Próximos passos (handoff pro agente)

> Documento de continuação. Leia inteiro antes de codar. O sistema **já está no
> ar e funcionando**; o que falta é descrito na seção 5. Mantenha os padrões da
> seção 2 e cuidado com as armadilhas da seção 6.

---

## 0. Contexto em 30 segundos

CRM de **prospecção assistida por IA, com humano no loop**. A IA encontra,
enriquece, pontua e rascunha a mensagem; **o humano aprova e envia** (nunca o
contrário — isso protege de ban no WhatsApp e respeita LGPD).

- Produto user-facing: **CRM | 4YUmkt** · Codinome interno: **Garimpo**.
- No ar: **https://crm.4yumkt.com.br**
- Dono dos dados (login): `gab.feelix@gmail.com` (UUID em `OWNER_USER_ID`).
- Mapa estratégico (a "constituição" do projeto): `garimpo-mapa-do-projeto.md`.
- Reflexão de produto (modelo de 2 serviços): seção própria no `README.md`.

O usuário (4YUmkt) vende **DOIS serviços**: (1) **gestão de tráfego** e (2)
**automação / chatbot**. Isso é central pros próximos passos (seção 5.1).

---

## 1. Onde está tudo

Monorepo, **offline-first**: cada peça roda sem infra (mock/jsonfile/fixture) e
liga no Supabase trocando env. A camada de dados é a única que muda.

```
supabase/migrations/   schema Postgres (8 migrations aplicadas no banco real)
front/                 Next.js 16 + shadcn (Base UI) + Tailwind 4 → Vercel
esteira/               cascata Python (discover→enrich→score→draft) → GitHub Actions cron
extension/             Chrome MV3 read-only sobre WhatsApp Web
scripts/               validate-local.mjs (valida schema offline via pglite), db-push/verify
.github/workflows/     ci.yml (testes a cada push) + esteira.yml (cron diário)
.env                   segredos (gitignored) — Supabase + Vercel token + OWNER_USER_ID
```

### Stack viva
- **Supabase** (ref `uqwnpuonrbupsqstetww`, região sa-east-1): Postgres + Auth + RLS.
- **Vercel** (time `4-yu-mkt`, projeto `garimpo`): front. Deploy via `vercel` CLI + `VERCEL_TOKEN`.
- **GitHub Actions** (`4yu-apps/CRM`): CI + cron da esteira. Secrets já setados.
- **Domínio**: `crm.4yumkt.com.br` (Hostinger → CNAME `crm`→`cname.vercel-dns.com`).

### Arquivos-chave por área
- **Schema/máquina de estados**: `supabase/migrations/*` (fonte da verdade).
- **Esteira**: `esteira/src/garimpo_esteira/`:
  `discovery.py` (Maps→bruto), `cascade.py` (enrich), `scoring.py` (score ICP, regras puras),
  `score_stage.py`, `draft/` (mock|gemini + prompt), `draft_stage.py`,
  `sink/` (jsonfile|supabase), `config.py` (fábricas + env), `run.py` (CLI), `grid.py` (grade Maps).
- **Front**: `front/src/`:
  `lib/types.ts`, `lib/state-machine.ts`, `lib/repo/` (mock|supabase), `lib/funnel.ts`,
  `lib/auth.tsx`, `components/`, `app/` (page=Leads, dashboard, login).
- **Extensão**: `extension/src/`:
  `lib/match.mjs` (casa conversa↔lead), `lib/state-machine.mjs`, `lib/repo.mjs`,
  `src/content/main.mjs` (painel), `manifest.json`, `content.bundle.js` (gerado por `npm run build`).

---

## 2. Convenções (siga à risca)

1. **Offline-first**: toda feature nova roda sem banco (mock/fixture) e liga por
   env. Replique o padrão `repo`/`sink` (interface + impl mock + impl supabase).
2. **Espelhamento**: a máquina de estados existe em 3 lugares (banco = fonte da
   verdade; `front/src/lib/state-machine.ts`; `extension/src/lib/state-machine.mjs`).
   Mudou um, espelhe nos outros.
3. **Commits em pt-BR**, curtos, terminando com:
   `Co-Authored-By: <seu-modelo> <noreply@anthropic.com>`
4. **Push por etapa** pro `4yu-apps/CRM` (o dono quer ver progresso a cada fase).
5. **Verificação antes de commitar** (seção 7). Sem teste verde, não fecha.
6. **Segredos**: só no `.env`/`.env.local` (gitignored). Repo é PÚBLICO. Nunca commite chave.

---

## 3. Modelo de dados (resumo — detalhe nas migrations)

Tabela `leads` (fonte da verdade) + `lead_field_provenance` (qual fonte achou
cada campo) + `lead_status_history` (auditoria) + `lead_status_transitions`
(máquina de estados data-driven). RLS: `owner_id = auth.uid()`. Esteira usa
`service_role` (bypassa RLS); front/extensão usam a sessão logada.

Máquina de estados:
```
bruto → enriquecido → qualificado → rascunho_pronto → aprovado → enviado
            ↓descartado                                    ↓
                              respondeu ⇄ sem_resposta (follow-up)
                              ↓ interessado → reuniao → proposta → fechado/perdido
                              ↓ sem_interesse
```
Mudança de status SEMPRE via a RPC `transition_lead(p_lead_id, p_new_status,
p_actor, p_note)` (valida transição + guarda LGPD + grava histórico).

Campos relevantes do lead: identidade (`business_name, cnpj, phone, email,
instagram, website`), Maps (`rating, reviews_count, category, city, state,
neighborhood, maps_place_id`), `owner_name`, qualificação (`score, score_reason`
jsonb), LGPD (`opt_out`), rascunho (`draft_msg1, draft_msg2, draft_model`).

---

## 4. Como rodar/testar cada parte (offline, sem banco)

```bash
# schema (valida as migrations num Postgres embutido, sem docker)
npm install && npm run db:validate

# esteira (pipeline inteiro com fixtures + copy mock)
cd esteira && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
python -m garimpo_esteira.run discover --sink jsonfile --json /tmp/g.json --maps fixture --terms "pizzaria"
python -m garimpo_esteira.run pipeline --sink jsonfile --json /tmp/g.json --sources fixture --llm mock --delay 0
python -m pytest                      # 49 testes

# front (modo mock)
cd front && npm install && npm run dev # localhost:3000 ; npm run lint ; npm run build

# extensão (testes da lógica pura)
cd extension && node --test            # 13 testes ; npm run build (regera content.bundle.js)
```

Pra rodar contra o Supabase real: ver `.env.example` de cada pasta (sink=supabase / NEXT_PUBLIC_DATA_SOURCE=supabase).

---

## 5. PRÓXIMOS PASSOS (em ordem)

### 5.1 — Modelo de 2 serviços: tráfego × automação × ambos  ⭐ PRIORIDADE

**Por quê:** o dono vende tráfego E automação/chatbot. Um lead pode servir pra
um, pro outro, ou pros dois. Hoje o score/copy é genérico (um ICP só). Precisa
distinguir e cruzar.

**Entregar:**

a) **Schema** — nova migration `supabase/migrations/20260619120009_service_target.sql`:
   ```sql
   create type public.service_target as enum ('trafego','automacao','ambos','indefinido');
   alter table public.leads add column if not exists service_target public.service_target not null default 'indefinido';
   ```
   Atualizar `scripts/validate-local.mjs` (checar a coluna nova) e rodar `npm run db:push`.

b) **Esteira `scoring.py`** — quebrar em dois ICPs:
   - `score_trafego(lead, signals)`: nota alta + volume bom + **NÃO anuncia** + descuido digital (sem site/IG).
   - `score_automacao(lead, signals)`: **muito volume** de avaliações (muito cliente) + atendimento manual/lento + agenda no WhatsApp + sem site/chatbot.
   - `score_lead` chama os dois, decide `service_target`: passou em trafego → 'trafego'; em automacao → 'automacao'; nos dois → 'ambos'; nenhum → descarta. Headline `score` = max dos dois. `score_reason` = `{service_target, trafego:{total,criteria}, automacao:{total,criteria}, decision}`.
   - Manter regra dura: sem telefone → descartado.

c) **`score_stage.py`** — gravar `service_target` além de `score`/`score_reason`.
   Adicionar `service_target` em `models.py` (Lead) e nos `sink` (`_LEAD_COLS` do supabase; jsonfile pega via dataclass).

d) **`draft/prompt.py` + providers** — copy por serviço. `build_prompt(lead)` e
   `MockDraftProvider`/`GeminiDraftProvider` recebem o `service_target` e escrevem
   o pitch certo (tráfego ≠ chatbot). "ambos" → lidera com o de maior score + cita o outro (upsell).

e) **Front** — `types.ts` (add `service_target`), badge na tabela/detalhe,
   filtro por serviço, e o bloco de score mostrando os dois ICPs. Atualizar o
   seed mock (`lib/repo/mock-data.ts`) com leads de cada serviço.

f) **Tests** — `esteira/tests/test_scoring.py`: casos trafego-only, automacao-only,
   ambos, nenhum. Atualizar `test_score_stage.py`/`test_pipeline.py`.

> Regra de negócio: a **captação mira 1 serviço por campanha**, mas o **score
> ainda sinaliza o OUTRO serviço quando encaixa** (cross-sell). Não jogue fora a
> oportunidade dos 2.

### 5.2 — Linkar a IA real (Gemini free tier)

A copy hoje é template (`mock`). `GeminiDraftProvider` já existe em
`esteira/src/garimpo_esteira/draft/gemini.py`.

- `.env` (e secret do GitHub): `GEMINI_API_KEY=...`; setar `GARIMPO_LLM=gemini`
  (no GitHub: variável de repo `GARIMPO_LLM`, o `esteira.yml` já lê `vars.GARIMPO_LLM`).
- Conferir o nome do modelo (`GEMINI_MODEL`, default `gemini-flash-latest`) e
  testar uma chamada real (`python -m garimpo_esteira.run draft --llm gemini` com um lead em `qualificado`).
- Pegadinha (mapa §5): free tier pode treinar no prompt do Google — dado público
  de negócio = baixo risco; se incomodar, pago.

### 5.3 — Captação real do Maps (na extensão, R$0)

O combustível: leads reais sem pagar Places. Hoje lead entra manual/demo.

**Design:** content script novo na extensão, em `https://www.google.com/maps/*`:
- Botão flutuante **"Garimpar esta busca"** + mini-form (segmento, região/cidade, **serviço-alvo**).
- Raspa a lista de resultados do painel (DOM do Maps é instável — use seletores
  resilientes: `[role="feed"]`, `[role="article"]`, aria-labels). Pega o que tiver:
  `business_name, rating, reviews_count, category` (telefone às vezes só abrindo o card — v1 pode deixar o enrich pegar depois).
- Insere como `bruto` via `repo.mjs` (modo supabase), carimbando `category` (segmento),
  `city/state` (região) e `service_target` (do form). Dedup por `maps_place_id`
  (índice único já existe — migration 8) ou por nome+cidade quando não houver place_id.
- **Bundle clássico (esbuild)** como o content script do WhatsApp (CSP do Maps
  bloqueia `import()` dinâmico — ver seção 6). Reaproveite `grid.py`/conceito de
  varredura se for paginar/varrer regiões grandes (teto de ~120 do Maps).

*(Alternativa paga, já codada: `PlacesMapsSource` em `discovery.py` — Google
Places API, mas tem custo. R$0 = extensão.)*

### 5.4 — (opcional) nome→CNPJ

O Maps dá telefone/nome, não CNPJ. Pra enriquecer `owner_name` via CNPJ, falta
resolver "nome do negócio → CNPJ" (ex.: busca em base pública / ReceitaWS). Sem
isso, o telefone (que já vem do Maps) basta pra contatar. Baixa prioridade.

---

## 6. Gotchas / armadilhas (aprendidas no caminho — não repita)

**Next.js 16 (front):**
- `front/AGENTS.md` manda **ler `node_modules/next/dist/docs/` antes de codar** front. Respeite.
- `next lint` **foi removido** → lint é `eslint` direto (`npm run lint`).
- shadcn aqui usa **Base UI, não Radix** → **não tem `asChild`**; use Dialog/Tooltip
  controlados (`open`/`onOpenChange`) ou a prop `render`.
- Lint pega: `react-hooks/set-state-in-effect` (fetch-on-mount → desabilite com
  comentário justificado) e `react-hooks/static-components` (não declare componente
  dentro do render — vira função top-level).
- Imagens: use `next/image` (não `<img>`).

**Extensão (CSP):**
- Content script **TEM que ser bundle clássico IIFE** (`esbuild` → `content.bundle.js`,
  já no manifest). `import()` dinâmico de ESM é **bloqueado pelo CSP** do WhatsApp/Maps.
  Editou `src/`? rode `npm run build`.
- **Não tem popup.** O painel aparece DENTRO da página (web.whatsapp.com / maps).

**Supabase:**
- RLS `owner_id = auth.uid()`. Esteira = `service_role` (bypassa). Front/extensão =
  sessão logada (o mesmo client supabase-js carrega o JWT).
- Keys novas: `sb_publishable_...` (publishable) funciona como anon no supabase-js.
- Status SEMPRE via RPC `transition_lead` (não dê UPDATE direto no status).

**Deploy/infra:**
- Front → Vercel: `npx vercel deploy --prod --token $VERCEL_TOKEN --scope 4-yu-mkt`
  (de dentro de `front/`). Envs `NEXT_PUBLIC_*` em Production via `vercel env add`.
- GitHub: `gabrielfeelix` tem admin. Secrets via `gh secret set --repo 4yu-apps/CRM`.
- Mudou schema? `npm run db:push` (Supabase CLI; ignore o warning de Docker — é só cache local).

---

## 7. Definition of Done (verifique antes de fechar cada passo)

- [ ] `cd esteira && python -m pytest` verde (atualize/adicione testes).
- [ ] `cd extension && node --test` verde (se mexeu na extensão).
- [ ] `npm run db:validate` verde (se mexeu no schema — atualize `validate-local.mjs`).
- [ ] `cd front && npm run lint && npm run build` limpos (se mexeu no front).
- [ ] Schema novo aplicado: `npm run db:push && npm run db:verify`.
- [ ] Front redeployado se mudou (`vercel deploy --prod`).
- [ ] Commit pt-BR + trailer, push pro `4yu-apps/CRM`.

---

## 8. Ordem recomendada

**5.1 (2 serviços) → 5.2 (Gemini) → 5.3 (captação Maps) → 5.4 (nome→CNPJ, opcional).**

Razão: 5.1 dá sentido de negócio (score/copy por serviço); 5.2 é rápido e melhora
a copy; 5.3 é o combustível (lead real). Se a prioridade do dono for "ter lead
real fluindo já", inverta 5.3 pra frente — mas aí a copy/score sai genérica até
fazer 5.1.
