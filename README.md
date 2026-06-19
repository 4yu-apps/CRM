# CRM | 4YUmkt

CRM de prospecção assistida por IA — barato, com **humano no loop**. A IA
encontra, enriquece, pontua e rascunha. O humano aprova e envia. Nunca o
contrário. (Codinome interno: **Garimpo**.) Mapa estratégico:
[`garimpo-mapa-do-projeto.md`](garimpo-mapa-do-projeto.md).

> 🤖 **Continuando o projeto?** Leia [`PROXIMOS-PASSOS.md`](PROXIMOS-PASSOS.md) —
> handoff com contexto, arquitetura, próximos passos e armadilhas.

**Status: NO AR** → **https://crm.4yumkt.com.br**
- Banco + Auth + RLS no **Supabase** · front na **Vercel** · esteira no
  **GitHub Actions** (cron diário) · extensão no **WhatsApp Web**.
- As 6 fases (0–5) construídas, testadas e em produção. Falta só o **resto
  operacional** abaixo (captação real do Maps + IA + modelo de 2 serviços).

Monorepo:

| Pasta        | Peça                | Estado |
|--------------|---------------------|------|
| `supabase/`  | Banco (Postgres)    | **✓ no ar** |
| `front/`     | CRM Next.js + shadcn (Vercel): leads + dashboard + login | **✓ no ar** |
| `esteira/`   | Cascata Python: enrich + score + rascunho (GitHub Actions) | **✓ no ar (cron)** |
| `extension/` | Chrome MV3 read-only (WhatsApp Web) | **✓ funcionando** |

- Front: ver [`front/README.md`](front/README.md). Roda em mock (`cd front && npm install && npm run dev`).
- Esteira: ver [`esteira/README.md`](esteira/README.md). Roda offline (`cd esteira && python -m garimpo_esteira.run seed-demo … && … pipeline --sources fixture --llm mock`).
- Extensão: ver [`extension/README.md`](extension/README.md). Carrega sem build em `chrome://extensions` (modo dev).
- CI: `.github/workflows/ci.yml` valida schema (pglite), testes da esteira (pytest), da extensão (node) e build do front a cada push.

---

## Para ser 100% operável + modelo de serviços (tráfego × automação)

> Reflexão de produto. O trilho técnico funciona ponta a ponta; o que falta é
> **lead real em escala** e **dois ajustes de produto** (IA real + 2 serviços).

### O que falta pra operar com lead REAL (não-demo)

1. **Captação real do Maps (R$0)** — capturador **dentro da extensão**. Hoje o
   lead entra por "Novo lead" (manual) ou fixture/demo. Caminho R$0: um botão
   *"garimpar esta busca"* no Maps que joga os negócios da tela como `bruto` no
   banco (carimbando **região + segmento**). A lógica de grade (contorna o teto
   de ~120) já existe em `esteira/grid.py`. *(Alternativa paga: Places API — já
   tem cliente em `esteira/discovery.py`, mas custa, não é R$0.)*
2. **Linkar a IA real (Gemini free)** — a copy do rascunho hoje é template
   (`mock`). Pra copy de verdade: `GEMINI_API_KEY` (free tier) + `GARIMPO_LLM=gemini`
   (no `.env` e nos secrets do GitHub).
3. **Modelo de 2 serviços** (tráfego × automação) — ver abaixo. É o ajuste mais
   importante de produto.
4. *(Opcional)* **nome→CNPJ** — o Maps dá telefone/nome, não CNPJ. Pra enriquecer
   o nome do dono via CNPJ falta um passo "nome do negócio → CNPJ". Sem isso, o
   telefone (que já vem do Maps) já basta pra contatar.

### Pra que a IA serve — e pra que NÃO

- **Score = regras puras, SEM IA** (determinístico, explicável, R$0).
- **IA serve pra:** (a) **escrever a copy** (rascunho de 2 msgs) — já existe;
  (b) **classificar qual serviço encaixa** (tráfego/automação/ambos) — a construir.
- **IA NÃO serve pra capturar o Maps** — é leitura de dado estruturado (nome,
  telefone, nota), não precisa de IA.
- **Falta:** plugar a chave do Gemini pra (a) e (b) saírem do mock.

### Maps: região e segmento são SEUS, por busca (não é hardcoded)

Nada é fixo. Cada **garimpada = segmento (tipo de negócio) + região (cidade/área)**.
Quer SP? roda região=SP. Depois RJ? região=RJ. Só pizzarias? segmento=pizzaria.
O banco já guarda `category` (segmento) + `city`/`state`/`neighborhood` (região),
então **filtra e separa por isso** no front.

Modelo mental: **campanha de captação** = `{ segmento, região, serviço-alvo }`.
Uma garimpada por campanha. Ex.: "pizzarias em Maringá pra tráfego", depois
"clínicas em SP pra automação".

### Os 2 serviços: tráfego × automação (chatbot) × ambos

Você vende **dois produtos**, e um lead pode servir pra um, pro outro, ou pros
dois. O sistema precisa **separar e cruzar** isso:

**1. Dimensão `service_target` no lead** — `trafego | automacao | ambos | indefinido`.
Vem da campanha (você mira um serviço) OU a IA/score decide depois.

**2. ICP (score) diferente por serviço:**

| Sinal | Tráfego (ads) quente quando… | Automação (chatbot) quente quando… |
|---|---|---|
| Nota / avaliações | nota alta + volume bom (demanda pra escalar) | **muito** volume (muito cliente = muito atendimento) |
| Anúncio | **NÃO** anuncia (oportunidade de começar) | indiferente |
| Site / presença | sem site / IG fraco (descuido digital) | sem site / agendamento manual |
| Atendimento | — | responde devagar / WhatsApp é o canal / agenda na mão |

→ O score vira **dois scores** (`trafego_score`, `automacao_score`) no
`score_reason`. Passou nos dois = **ambos** = oportunidade de vender o pacote.

**3. Copy (rascunho) diferente por serviço** — pitch de tráfego ≠ pitch de
chatbot. O provider de rascunho recebe o `service_target` e escreve a mensagem
certa. "Ambos" → lidera com o serviço de score mais alto e menciona o outro
como upsell.

**4. No funil/dashboard** — filtra e mede por serviço (leads/fechados de tráfego
vs automação vs ambos).

> **Decisão:** adicionar `service_target` (lead) + ICP/score por serviço + copy
> por serviço. A captação mira um serviço por campanha; o score ainda **sinaliza
> o OUTRO serviço quando encaixa** (cross-sell). Assim você nunca perde a
> oportunidade dos 2.

### Ordem sugerida de construção

1. **Modelo de 2 serviços** — schema (`service_target`) + score por serviço +
   copy por serviço. É o que dá sentido de negócio ao resto.
2. **Linkar Gemini** — copy real (e, depois, a classificação de serviço por IA).
3. **Captação Maps na extensão** — lead real, R$0.
4. *(Opcional)* **nome→CNPJ** — enriquecer o nome do dono.

---

## Fase 0 — Fundação (banco)

O schema do Supabase com a máquina de estados embutida, proveniência por
campo, histórico de status, dedup e RLS. É o tijolo que sustenta o resto.

### O que tem

- **`leads`** — fonte da verdade. Identidade do negócio, dados de Maps/CNPJ,
  score explicável (`score_reason` jsonb), `opt_out` LGPD, e colunas geradas
  `cnpj_normalized` / `phone_normalized` para dedup.
- **`lead_field_provenance`** — qual fonte achou cada campo (upsert idempotente
  por `lead_id, field_name, source`).
- **`lead_status_history`** — auditoria imutável das mudanças de status.
- **`lead_status_transitions`** — máquina de estados data-driven (editar a
  tabela muda as regras, sem código).
- **Triggers/funções** — `updated_at`, carimbo de opt-out, validação de
  transição, guarda LGPD (opt-out não avança para contato), log automático de
  histórico, e a RPC **`transition_lead()`** (a API que front/extensão usam).
- **RLS** — só o dono (`owner_id = auth.uid()`) enxerga/mexe. Esteira usa
  `service_role` (bypassa RLS).

Máquina de estados (canônica, seção 6 do mapa):

```
bruto → enriquecido → qualificado → rascunho_pronto → aprovado → enviado
                          ↓ descartado        ↑ [humano]   [humano] ↓
                                          respondeu ⇄ sem_resposta (follow-up)
                                          ↓ interessado → reuniao → proposta → fechado / perdido
                                          ↓ sem_interesse
```

### Aplicar no seu Supabase

1. Crie o projeto no [Supabase](https://supabase.com).
2. Copie `.env.example` → `.env` e preencha `SUPABASE_DB_URL` (Dashboard →
   Project Settings → Database → Connection string → URI).
3. Aplique as migrations e verifique:

   ```bash
   npm install
   npm run db:push:dry   # previa (opcional)
   npm run db:push       # aplica as 6 migrations
   npm run db:verify     # checa o catalogo (tabelas, enum, RLS, transicoes)
   ```

`db:verify` confirma: 4 tabelas, enum de 15 estados, RLS nas 4 tabelas, 24
transições, RPC `transition_lead`, colunas geradas e índices de dedup.

### Como cada ator escreve

- **Front / extensão** (usuário logado): `supabase.rpc('transition_lead', { p_lead_id, p_new_status, p_actor, p_note })`. `owner_id` cai automático em `auth.uid()`.
- **Esteira Python** (`service_role`): insere/atualiza direto, passando
  `owner_id = OWNER_USER_ID`. Bypassa RLS; validação e histórico continuam valendo.

---

## Stack & custo

Supabase free + GitHub Actions cron + Vercel hobby + Gemini free tier no
runtime. Meta: **< R$30/mês**. Detalhes na seção 10 do mapa.
