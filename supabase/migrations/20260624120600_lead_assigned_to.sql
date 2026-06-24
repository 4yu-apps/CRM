-- =====================================================================
-- Garimpo - fundacao de multiusuario (#21, Fase 8) — ADITIVO E SEGURO.
-- Adiciona assigned_to (responsavel pelo lead) sem tocar na RLS atual.
-- Hoje tudo e single-user (owner_id = auth.uid()); a coluna fica pronta
-- pra quando o modelo de organizacao/time entrar na fase SaaS, momento
-- em que a RLS sera reescrita junto (ver docs/phase8-multiuser-plan.md).
-- Nullable + on delete set null = nao quebra nada que ja existe.
-- =====================================================================
alter table public.leads
  add column if not exists assigned_to uuid
    references auth.users (id) on delete set null;

create index if not exists leads_assigned_to_idx
  on public.leads (assigned_to) where assigned_to is not null;
