# Fase 8 — Multiusuário (#21): plano de migração

> Status: **fundação aditiva entregue** (coluna `leads.assigned_to`). A reescrita
> de RLS e o modelo de organização ficam para a fase SaaS — é a mudança de maior
> risco do roadmap e não deve ser feita às cegas na produção single-user ao vivo.

## Por que está faseado e não foi tudo de uma vez

Hoje todo o acesso é `owner_id = auth.uid()` (single-tenant por usuário). Tornar
multiusuário exige **reescrever a RLS da tabela `leads`** (e auxiliares). Um erro
nessa policy tranca o acesso do dono em produção. Reescrever isso sem ambiente de
staging e com o solicitante offline seria irresponsável. Então a Fase 8 entrega só
o que é **aditivo e reversível**, e deixa o resto desenhado pra execução guiada.

## Já entregue (seguro, aditivo)

- `leads.assigned_to uuid null references auth.users(id) on delete set null`
  (migration `20260624120600_lead_assigned_to.sql`). Inerte: a RLS atual não muda,
  o comportamento single-user é idêntico. Tipo já mapeado em `Lead` e `LeadEditable`.

## A fazer na fase SaaS (ordem sugerida)

1. **Modelo de organização** (migration aditiva):
   - `orgs (id, name, created_by, created_at)`.
   - `org_members (org_id, user_id, role, created_at)` — role ∈ `admin|gestor|sdr|vendedor`.
   - RLS própria dessas tabelas (membro vê a própria org; admin gerencia). Sem tocar `leads` ainda.
2. **Vincular leads à org**: `leads.org_id uuid` (backfill = org pessoal de cada owner).
3. **Reescrita da RLS de `leads`** (o passo de risco — fazer com staging + backup):
   - SELECT: `owner_id = auth.uid() OR org_id IN (orgs do usuário) OR assigned_to = auth.uid()`.
   - WRITE: idem, respeitando papel (sdr/vendedor só mexe nos atribuídos a ele; gestor/admin na org toda).
   - Validar com o usuário logado ANTES de dropar a policy antiga (testar com dois usuários).
4. **Atribuição na UI**: seletor "responsável" no card/ficha/funil (usa `assigned_to`),
   filtro "meus leads" vs "da equipe", e visão "quem cuida do quê".
5. **Papéis & permissões**: esconder/mostrar ações por role; admin gerencia membros.
6. **Ranking/desempenho**: relatório por pessoa (enviados, respostas, fechados, receita,
   comissão) — reusa `funnel.ts`/`kpis()` agrupando por `assigned_to`.
7. **Convites**: criar/convidar usuários (Supabase Auth admin API no backend).

## Riscos & mitigação

- **Lockout por RLS**: sempre criar a nova policy lado a lado, testar com sessão real
  de dois usuários, e só então remover a antiga. Ter o SQL de rollback pronto.
- **Backfill**: todo lead existente precisa de `org_id` antes de a policy passar a exigir.
- **Alinhar com `project-vision-saas-roadmap`** (assinatura, multi-vertical).
