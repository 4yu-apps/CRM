# Garimpo

CRM de prospecção assistida por IA — barato, com **humano no loop**. A IA
encontra, enriquece, pontua e rascunha. O humano aprova e envia. Nunca o
contrário. Mapa completo do projeto: [`garimpo-mapa-do-projeto.md`](garimpo-mapa-do-projeto.md).

**Status:** tudo que não depende de infra está **pronto e rodando offline** —
as 6 fases (0–5) + login (front e extensão), criar lead manual e a captação
(Maps → bruto). Falta **só você**: aplicar as migrations no Supabase (+ env) e
o deploy do front na Vercel. Nenhuma reescrita — é plugar chaves.

**Ao linkar:**
1. Supabase: criar projeto → `.env` → `npm run db:push && npm run db:verify`
2. Front: `front/.env.local` (`NEXT_PUBLIC_DATA_SOURCE=supabase` + url/anon) → login com usuário do Supabase
3. Vercel: deploy de `front/` (hobby)
4. Esteira/extensão: secrets no GitHub Actions + login nas opções da extensão

Monorepo:

| Pasta        | Peça                | Fase |
|--------------|---------------------|------|
| `supabase/`  | Banco (Postgres)    | **0 ✓** |
| `front/`     | CRM Next.js + shadcn (Vercel): leads + **dashboard** | **1 ✓ · 5 ✓ (mock; liga no Supabase via env)** |
| `esteira/`   | Cascata Python: enrich + score + rascunho (GitHub Actions) | **2 ✓ · 3 ✓** |
| `extension/` | Chrome MV3 read-only (WhatsApp Web) | **4 ✓ (mock; liga no Supabase nas opcoes)** |

- Front: ver [`front/README.md`](front/README.md). Roda em mock (`cd front && npm install && npm run dev`).
- Esteira: ver [`esteira/README.md`](esteira/README.md). Roda offline (`cd esteira && python -m garimpo_esteira.run seed-demo … && … pipeline --sources fixture --llm mock`).
- Extensão: ver [`extension/README.md`](extension/README.md). Carrega sem build em `chrome://extensions` (modo dev).
- CI: `.github/workflows/ci.yml` valida schema (pglite), testes da esteira (pytest), da extensão (node) e build do front a cada push.

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
