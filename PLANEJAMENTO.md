# CRM | 4YUmkt, planejamento revisado (UX + código)

> **Para agentes:** este documento revisa e substitui as seções 5 e 8 do
> `PROXIMOS-PASSOS.md`. Ele nasce de (a) rodadas de design com o dono (persona
> "Rafa", gestor de tráfego leigo) e (b) um mapeamento do código real em
> 2026-06-19. Cada fase cita o que **já existe** vs o que **falta**. Ao
> executar uma fase, peça pra destrinchar ela em plano TDD passo a passo
> (formato `superpowers:writing-plans`) antes de codar.

**Objetivo:** levar o Garimpo de "ICP genérico + captação manual" para "2
serviços classificados + captação por formulário com varredura sem repetição +
copy real", com a interface limpa, acessível e sem cara de IA, mantendo o
humano no loop.

**Arquitetura:** monorepo offline-first. Cada peça roda sem infra (mock/
fixture) e liga no Supabase por env. Separação dura entre **regra
determinística** (achar, filtrar, deduplicar, é `if` em Python, confiável) e
**IA-sugestão** (ler sinais + escrever copy, sempre com motivo + veto humano).

**Stack:** Supabase (Postgres+Auth+RLS) · Next.js 16 + shadcn(Base UI) → Vercel ·
esteira Python (GitHub Actions cron) · extensão Chrome MV3 (esbuild IIFE).

---

## Constraints globais (toda fase herda)

- **Offline-first:** feature nova roda sem banco (mock/fixture), liga por env.
  Replicar o padrão `repo`/`sink` (interface + impl mock + impl supabase).
- **Espelhamento triplo:** a máquina de estados vive em banco (verdade),
  `front/src/lib/state-machine.ts`, `extension/src/lib/state-machine.mjs`.
  Mudou um, espelhe os outros.
- **Status só via RPC** `transition_lead`. Nunca `UPDATE` direto no status.
- **Migrations append-only**, numeradas. Toda mudança de schema atualiza
  `scripts/validate-local.mjs` (offline, pglite) **e** `scripts/verify.mjs`.
- **TDD por camada:** esteira → `pytest`; front → `npm run lint && npm run build`;
  extensão → `node --test`; schema → `npm run db:validate`.
- **Zero travessões, zero cara de IA:** nunca usar travessões (nenhum tipo) em
  copy, UI, prompt, commit ou doc. Sem ícone de IA, sem sparkles, sem emoji
  decorativo, sem frase robótica. Voz humana. Ver `GUIA-COPY-HUMANA.md`.
- **Commits pt-BR** curtos + trailer `Co-Authored-By: <modelo> <noreply@anthropic.com>`.
  **Push por etapa.** **Repo é PÚBLICO**, segredo só em `.env` (gitignored).
- **Divisão de modelos:** Opus desenha (schema/RLS/máquina = julgamento),
  Codex executa (migrations, boilerplate, escopo fechado). Nunca os dois
  desenhando junto.

---

## Parte A, reflexão de UX (princípio → mudança concreta)

O usuário é leigo em tech, mora no WhatsApp, fecha o app no primeiro erro
vermelho. Princípios e o que cada um cobra:

1. **Ação antes de dado.** Hoje a home (`front/src/app/page.tsx`) é um hub
   exploratório (tabela + filtros). Pro Rafa cansado, parece trabalho. A home
   abre com uma frase + um botão ("8 leads prontos, aprovar"). Hub e dashboard
   viram telas secundárias. (Fase 6)

2. **Não dá pra quebrar.** Transições hoje são imediatas e silenciosas. Botão
   de desfazer e confirmação em tudo que destrói (descartar, enviar, mudar
   status). Toast com "desfazer" resolve a maioria. (Fase 6)

3. **Ações de lead que faltam.** O Rafa pediu: reativar um lead descartado,
   arquivar, excluir. Hoje `descartado` é terminal (sem saída na máquina) e não
   há ação de arquivar/excluir na UI. (Fase 0)

4. **Score vira gente, não número.** O `score_reason` já guarda critérios com
   label (`scoring.py:105`). O card mostra português ("Nota 4.6, 210
   avaliações, não anuncia, site sem pixel, bate no teu perfil"), nunca "score
   87", e com visual atraente (barra/medidor), não um número solto. Com 2
   serviços, mostra os dois veredictos. (Fases 0 e 1)

5. **Legível de verdade.** O dono apontou fontes pequenas e finas demais em
   alguns lugares, ilegíveis. Auditoria de acessibilidade no sistema todo
   (contraste, tamanho e peso de fonte, foco, leitor de tela), WCAG 2.2. (Fase 0)

6. **Engenharia invisível + saúde.** GitHub Actions, Supabase, Gemini nunca
   aparecem pro Rafa. O badge "Supabase/mock" no cabeçalho (`nav-bar.tsx`) sai
   da visão do usuário. Quando a esteira quebra, o sistema avisa o mantenedor
   (você), nunca mostra erro pro Rafa. Exige um conceito de saúde. (Fases 0 e 7)

7. **Sem cara de IA.** Passada geral pra caçar AI-tells: travessões, ícone de
   IA, emoji decorativo, copy robótica. A mensagem de saída segue o
   `GUIA-COPY-HUMANA.md`. (Fase 0 audita, Fase 1/5 aplica na copy)

8. **Confiança no comando.** Caixa de texto livre trava leigo. Buscar é
   formulário (categoria + cidade/CEP + qtd + serviço), determinístico, com
   confirmação em PT antes de rodar ("Buscando hamburgueria na Zona 7, Maringá,
   ignorando os que você já tem"). IA por linguagem natural fica fora do MVP. (Fase 3)

---

## Parte B, reflexão de código (princípio → mudança concreta)

1. **Regra × IA explícita no schema.** Hoje `score_reason` (jsonb) mistura
   tudo. Manter o filtro duro como regra pura testável (`scoring.py`) e
   estruturar `score_reason` separando os dois ICPs e a decisão. IA só no
   `draft/`. Nenhuma IA decide o que buscar.

2. **Dedup como cidadã de primeira classe.** Existem índices únicos por
   `(owner_id, cnpj_normalized)`, `(owner_id, phone_normalized)`,
   `(owner_id, maps_place_id)` (migrations 3 e 8). Falta a 4ª chave da
   conversa: nome+endereço normalizado, pros leads sem CNPJ/place_id. (Fase 2)

3. **Um motor, dois gatilhos.** Não duplicar lógica de busca. O buscador é um
   script único (varredura + dedup), ganha dois gatilhos: automático (perfil
   salvo) e sob-comando (formulário). Reaproveita `grid.py`. (Fase 3)

4. **Estado de varredura persistido.** `grid.py` é stateless (puro, fácil de
   testar). A memória de cobertura (blocos/nichos já varridos) vai pra uma
   tabela (`scan_coverage`), não pro grid. O grid segue puro. (Fase 3)

5. **Offline-first em tudo novo.** Toda tabela nova ganha impl mock no front
   (`lib/repo/mock.ts` + `mock-data.ts`) e no sink da esteira.

6. **Extensão: falta o `insert`.** `extension/src/lib/repo.mjs` só faz
   `transition` (RPC). Pra captar do Maps (Fase 4) precisa de um `insertLead`
   (POST `/rest/v1/leads`, respeitando RLS via JWT logado).

7. **Cor com semântica.** `aprovado` hoje tem tom "accent" (roxo) em
   `state-machine.ts`. Estado bom (sua copy passou) deveria ler como positivo
   (verde). Revisar o mapa `tone` junto da auditoria de acessibilidade. (Fase 0)

8. **Espelhamento ao mexer em estados.** Reativar descartado adiciona transição
   na máquina, então espelhar nos 3 lugares + migration. `service_target` é só
   coluna, não toca a máquina (seguro).

---

## Parte C, roadmap revisado (sequência + dependências)

```
F0 Higiene visual + acessibilidade + ações (front, barato, cedo)
F1 Dois serviços ─┬─> F5 Gemini real (copy por serviço depende de F1)
                  │
F2 Confiança ─────┼─> F4 Captação Maps (precisa perfil + dedup nome+end)
 (perfil+dedup)   └─> F3 Buscador form + varredura com memória
F6 Polish UX (home-ação, undo, mobile, feedback)
F7 Saúde/observabilidade
F8 nome→CNPJ (opcional)
```

---

### F0: Higiene visual, acessibilidade, voz humana, ações de lead

**Por quê:** o dono apontou problemas concretos de uso agora (badge de infra no
cabeçalho, fonte ilegível, sidebar truncando dado, cor errada, falta de ações).
São quase tudo front, baratos, e melhoram o uso imediato. Bom primeiro passo.

**Depende de:** nada.

**O que existe (e incomoda):**
- `nav-bar.tsx` mostra badge `[Supabase|mock]` no cabeçalho (infra exposta).
- `state-machine.ts`: `aprovado` com tom "accent" (roxo), não verde.
- `lead-detail-sheet.tsx` + `provenance-list.tsx`: sidebar estreita, trunca os
  valores de proveniência (site, e-mail, telefone cortados).
- Fontes pequenas e finas demais em alguns pontos (ilegível).
- Sem ação de reativar descartado, arquivar ou excluir. `descartado` é terminal.

**O que construir:**

a) **Tirar infra da visão do user:** remover o badge `Supabase/mock` do
   `nav-bar.tsx` (ou esconder atrás de um modo dev). O Rafa nunca vê de onde
   vêm os dados.

b) **Zero travessões na plataforma:** varrer as strings do front (e copy do
   mock/draft) atrás de travessões e remover. Sugestão de varredura:
   `grep -rnP "[\x{2012}-\x{2015}\x{2212}]" front/src esteira/src extension/src`.
   Trocar por vírgula, parênteses ou ponto. Vira regra fixa daqui pra frente.

c) **Cor com semântica:** revisar o mapa `tone` em `state-machine.ts` (e o
   espelho da extensão). `aprovado` lê como positivo (verde/good). Conferir a
   escala inteira de tons com a auditoria de acessibilidade (contraste).

d) **Sidebar de detalhe mais larga:** alargar o `LeadDetailSheet` pra os
   valores de proveniência não truncarem (largura maior + quebra/elipse só
   quando faz sentido, com title/tooltip no valor completo).

e) **Score esteticamente atraente:** trocar o número cru por uma
   representação visual (medidor/barra com faixa de cor) + a explicação em PT.
   Prepara o terreno pros dois ICPs da F1.

f) **Auditoria de acessibilidade (WCAG 2.2) no sistema todo:** usar o skill
   `audit`. Caçar contraste insuficiente, fonte pequena/fina ilegível, foco
   invisível, alvo de toque pequeno, falta de label/aria. Gerar relatório
   priorizado e corrigir os bloqueantes.

g) **Auditoria de "cara de IA":** passada no front atrás de AI-tells (ícone de
   IA, sparkles, emoji decorativo, copy genérica, travessão). Remover.

h) **Ações de lead:**
   - **Reativar descartado:** nova transição `descartado → enriquecido` na
     tabela `lead_status_transitions` (migration) espelhada nos 3 lugares.
     Botão "Reativar" no detalhe de um lead descartado.
   - **Arquivar/desarquivar:** coluna `archived boolean default false` (não
     mexe na máquina). Arquivados somem da lista por padrão, com filtro
     "mostrar arquivados". Reversível.
   - **Excluir:** hard delete (RLS já concede DELETE ao dono). Botão destrutivo
     com confirmação. Atenção LGPD: excluir apaga histórico (cascade), então a
     UI recomenda arquivar em vez de excluir quando possível.
   - Deixar claro na UI a diferença entre **bloquear contato** (opt_out, LGPD,
     já reversível via `setOptOut`) e **arquivar/excluir**.

**DoD:** front `lint`+`build` limpos; relatório de acessibilidade sem
bloqueantes; nenhuma string com travessão (grep limpo); `db:validate` cobre a
nova transição e a coluna `archived`; reativar/arquivar/excluir testados em mock.

---

### F1: Dois serviços, tráfego × automação × ambos  (PRIORIDADE)

**Por quê:** o dono vende tráfego E automação. Um lead serve pra um, outro, ou
os dois. Hoje o score/copy é genérico (`scoring.py` tem um ICP só).

**Depende de:** nada (paralelizável com F0/F2).

**O que existe:** `scoring.py:77` `score_lead` (ICP único, threshold 50,
sem-telefone=descarta). `score_stage.py:23` grava score+reason. `models.py`
Lead sem `service_target`. Sink `_LEAD_COLS` (`sink/supabase.py:12`) sem a
coluna. `draft/prompt.py:30` e `draft/mock.py:31` hardcoded "tráfego local".
Front `types.ts` sem `service_target`, sem badge/filtro de serviço.

**O que construir:**

a) **Schema:** migration `20260619120009_service_target.sql`,
   `create type service_target as enum ('trafego','automacao','ambos','indefinido')`
   + coluna `not null default 'indefinido'`. Atualizar `validate-local.mjs` e
   `verify.mjs`. `db:push`.

b) **Esteira `scoring.py`:** dois ICPs puros.
   - `score_trafego(lead, signals)`: nota alta + volume bom + não anuncia +
     descuido digital (sem site/IG).
   - `score_automacao(lead, signals)`: muito volume (muito cliente) +
     atendimento manual + agenda no WhatsApp + sem site/chatbot.
   - `score_lead` chama os dois, decide `service_target` (trafego → 'trafego';
     automacao → 'automacao'; os dois → 'ambos'; nenhum → descarta). Headline
     `score` = max dos dois. Regra dura mantida: sem telefone = descartado.
     `score_reason` =
     `{service_target, trafego:{total,criteria}, automacao:{total,criteria}, decision}`.

c) **`score_stage.py` + `models.py` + sink:** gravar `service_target`. Add ao
   dataclass Lead e ao `_LEAD_COLS`.

d) **`draft/`:** copy por serviço, seguindo `GUIA-COPY-HUMANA.md`.
   `build_prompt(lead)` e os providers recebem `service_target` e escrevem o
   pitch certo. "ambos" lidera com o de maior score e cita o outro (upsell).

e) **Front:** `types.ts` add `service_target`; badge de serviço na tabela e no
   detalhe; filtro por serviço; bloco de score mostrando os dois ICPs em PT
   (reusa o visual de score da F0). Atualizar `mock-data.ts` com leads de cada
   serviço.

**DoD:** `pytest` (casos trafego-only, automacao-only, ambos, nenhum);
`db:validate`; front `lint`+`build`; `db:push`+`db:verify`.

---

### F2: Fundação de confiança, perfil salvo + dedup nome+endereço

**Por quê:** rodar automático (sem o Rafa escolher região) e nunca falar 2x com
a mesma pessoa. Exige perfil salvo e a 4ª chave de dedup. Pré-requisito de F3 e F4.

**Depende de:** nada (paralelizável com F1).

**O que existe:** dedup CNPJ/telefone/place_id (migrations 3, 8). Sem tabela de
perfil. Sem onboarding.

**O que construir:**

a) **Dedup nome+endereço:** coluna gerada `name_addr_normalized` (lower, sem
   acento, sem pontuação, de `business_name || city || neighborhood`) + índice
   único parcial `(owner_id, name_addr_normalized) where ... is not null`.
   Migration + scripts. Atualizar dedup do `jsonfile` sink e do `normalize.py`
   (`dedup_key` ganha fallback nome+end).

b) **Perfil/ICP salvo:** tabela `search_profile` (1 por owner): `owner_id`
   (PK/FK), `niches text[]`, `city`, `state`, `default_qty int`,
   `default_service_target`, timestamps. RLS `owner_id = auth.uid()`.

c) **Onboarding + perfil (front):** primeira vez (perfil vazio) → tela
   idiota-simples ("escolhe teus nichos, confirma tua cidade, pronto"). Salva e
   cai na home. Editável depois. Mock primeiro, depois supabase.

**DoD:** `db:validate` cobre a 4ª chave + a tabela; `pytest` do dedup
nome+end; front `lint`+`build`; onboarding roda em mock.

---

### F3: Buscador por formulário + varredura com memória

**Por quê:** combustível controlado. Rafa preenche categoria+cidade/CEP+qtd,
clica Buscar, e o mesmo motor da varredura roda, sem IA, sem repetir zona.

**Depende de:** F2 (perfil pro modo automático; dedup nome+end pra não duplicar).

**O que existe:** `grid.py` (varredura adaptativa stateless, pura).
`discovery.py` (dedup via `insert_lead`). Sem tabela de cobertura. Sem form no front.

**O que construir:**

a) **Schema `scan_coverage`:** blocos/nichos já varridos
   (`owner_id, niche, region_key/bbox, covered_at, result_count`).

b) **Orquestração com memória:** camada que lê `scan_coverage`, escolhe o
   próximo bloco do `grid.py` (que segue puro), varre, grava cobertura. Dois
   gatilhos, mesmo motor: automático (perfil) e sob-comando (params do form).

c) **Form de busca (front):** categoria (chips) + cidade/CEP + qtd (default 30)
   + serviço-alvo + botão Buscar. Confirmação em PT antes de rodar.

**DoD:** `pytest` da orquestração (não revisita bloco coberto); `db:validate`
cobre `scan_coverage`; front `lint`+`build`; form roda em mock.

---

### F4: Captação real do Maps (extensão, R$0)

**Por quê:** lead real sem pagar Places. Content script novo sobre
`google.com/maps/*`.

**Depende de:** F2 (dedup nome+end, serviço-alvo) e idealmente F3 (form/params).

**O que existe:** extensão só WhatsApp (`manifest.json`). `repo.mjs` só faz
`transition`, sem insert. `PlacesMapsSource` (pago) existe como alternativa.

**O que construir:**

a) **`repo.mjs` `insertLead`:** POST `/rest/v1/leads` com JWT logado (RLS),
   status `bruto`, carimbando `category`, `city/state`, `service_target`. Dedup
   pelos índices únicos (409 = duplicata, ignora).

b) **Content script Maps:** novo entry em `manifest.json` (matches
   `google.com/maps/*`, host permission). Botão flutuante "Garimpar esta busca"
   + mini-form. Raspar o painel com seletores resilientes (`[role="feed"]`,
   `[role="article"]`, aria-labels). Pega `business_name, rating,
   reviews_count, category`; telefone às vezes só abrindo o card (v1 deixa o
   enrich pegar depois).

c) **Bundle:** novo entry esbuild IIFE (CSP do Maps bloqueia `import()`
   dinâmico). `npm run build` ao editar `src/`.

**UX:** painel dentro da página (sem popup). Feedback de quantos entraram vs já
existentes ("12 novos, 4 você já tinha").

**DoD:** `node --test`; `npm run build` regenera o bundle; teste manual numa
busca real do Maps.

---

### F5: IA real (Gemini free tier)

**Por quê:** trocar copy template por copy real. `GeminiDraftProvider` já existe
(`draft/gemini.py:21`, `gemini-flash-latest`).

**Depende de:** F1 (prompts por serviço).

**O que construir:** `GEMINI_API_KEY` no `.env` + secret GitHub; variável de
repo `GARIMPO_LLM=gemini` (o `esteira.yml` já lê `vars.GARIMPO_LLM`). Conferir o
modelo, testar chamada real. Os prompts seguem `GUIA-COPY-HUMANA.md` (sem
travessão, voz humana, gancho real, CTA aberto) e o serviço da F1.

**Pegadinha:** free tier pode treinar no prompt (dado público = baixo risco).
Se digitar nome de cliente, migrar essa parte pro pago.

**DoD:** chamada real devolve msg1/msg2 coerentes por serviço, sem AI-tell;
fallback pro mock se a API falhar (não pode quebrar a esteira).

---

### F6: Polish de UX (home-ação, undo, mobile, feedback)

**Por quê:** transformar "CRM" em "assistente que já fez o dever de casa".

**Depende de:** F0 (higiene) e F1 (badge serviço na fila).

**O que construir:**
- Home action-first: frase + botão ("8 leads prontos, aprovar"). Hub e
  dashboard secundários.
- Undo/confirm em descartar/enviar/status (toast com "desfazer").
- Fila de aprovação no celular (aprovar do sofá; envio/extensão ficam desktop).
- Botão "essa mensagem tá ruim" no card (sinal de qualidade da copy IA).

**DoD:** front `lint`+`build`; aprovação testada em viewport mobile; undo
reverte status via `transition_lead`.

---

### F7: Saúde / observabilidade (alerta pro mantenedor)

**Por quê:** sistema com muita máquina escondida quebra calado. O Rafa só acha
que "não tem lead hoje". Sem isso, o projeto morre em silêncio.

**Depende de:** F3/F4 (faz sentido quando a esteira/captação roda sozinha).

**O que construir:** tabela `esteira_run`/`system_health` (última rodada,
status, contagem por etapa, erro). Alerta pro mantenedor quando falha, nunca
erro pro Rafa. Estados amigáveis no front ("buscando teus leads...").

**DoD:** `db:validate` cobre a tabela; uma falha simulada gera alerta pro
mantenedor, não erro pro usuário.

---

### F8: nome→CNPJ (opcional, baixa prioridade)

Resolver "nome do negócio → CNPJ" (base pública / ReceitaWS) pra enriquecer
`owner_name`. O telefone do Maps já basta pra contatar, então é baixa.

---

## Parte D, Definition of Done (por fase)

- [ ] `cd esteira && python -m pytest` verde (atualize/adicione testes).
- [ ] `cd extension && node --test` verde (se mexeu) + `npm run build`.
- [ ] `npm run db:validate` verde (se mexeu no schema, atualize os 2 scripts).
- [ ] `cd front && npm run lint && npm run build` limpos (se mexeu no front).
- [ ] Sem travessão e sem AI-tell no que tocou (grep limpo).
- [ ] Acessibilidade conferida no que mexeu (contraste, fonte, foco).
- [ ] Schema novo aplicado: `npm run db:push && npm run db:verify`.
- [ ] Front redeployado se mudou (`vercel deploy --prod`).
- [ ] Commit pt-BR + trailer, push pro `4yu-apps/CRM`.

---

## Ordem recomendada

**F0 (higiene+a11y) → F1 (2 serviços) ∥ F2 (perfil+dedup) → F3 (buscador) → F4
(Maps) → F5 (Gemini) → F6 (polish UX) → F7 (saúde) → F8 (CNPJ, opcional).**

F0 é barato e melhora o uso já. F1 e F2 são paralelizáveis (não se tocam) e
destravam o resto. Se a prioridade do dono for "lead real fluindo já", F4 sobe,
mas depende de F2 (dedup nome+end) pra não duplicar.
