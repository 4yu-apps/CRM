# Garimpo · Front (Fase 1)

CRM mínimo — tira o amigo do Sheets. Tabela de leads, filtro por funil, busca,
edição de campos, mudança de status pela máquina de estados, opt-out LGPD,
proveniência, histórico e o fluxo de aprovar rascunho (ver → editar → aprovar).

Next.js 16 (App Router) + shadcn/ui (Base UI) + Tailwind 4. Deploy: Vercel.

## Rodar

```bash
npm install
npm run dev          # http://localhost:3000
```

Por padrão roda em **modo mock** (dados em memória, sem banco) — dá pra usar a
UI inteira agora. A máquina de estados, dedup e guarda LGPD são reproduzidas no
mock, espelhando o banco da Fase 0.

## Ligar no Supabase

1. Aplique as migrations (raiz do repo): `npm run db:push` na pasta-pai.
2. `cp .env.local.example .env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY`, e `NEXT_PUBLIC_DATA_SOURCE=supabase`.
3. `npm run dev` — o badge no topo vira "Supabase".

A troca mock↔supabase não toca a UI: é só a camada `src/lib/repo`. O modo
supabase chama a RPC `transition_lead` do banco (valida transição + grava
histórico). _Obs: leitura/escrita exigem usuário logado (RLS) — a tela de login
(Supabase Auth) entra numa fase seguinte._

## Estrutura

```
src/
  lib/
    types.ts          tipos do dominio (espelham o schema)
    state-machine.ts  transicoes + metadados de status (espelha o banco)
    format.ts         formatadores pt-BR
    repo/             camada de dados: interface + mock + supabase
    supabase/client.ts
  hooks/use-leads.ts
  components/         tabela, sheet de detalhe, filtro, badge, rascunho, etc.
  app/                page.tsx (CRM) + layout
```

## Comandos

- `npm run dev` / `npm run build` / `npm run start`
- `npm run lint` (ESLint direto — `next lint` foi removido no Next 16)
