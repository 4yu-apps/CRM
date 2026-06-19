-- =====================================================================
-- Garimpo · F0 (acoes de lead) · reativar descartado + arquivar
-- Reativar: um descartado pode voltar pro funil (enriquecido) via a RPC
-- transition_lead. Arquivar: tira o lead da lista sem apagar (reversivel).
-- Excluir continua sendo o DELETE normal (RLS ja concede DELETE ao dono).
-- =====================================================================

-- 1. reativacao: descartado -> enriquecido (aproveita o que ja foi enriquecido)
insert into public.lead_status_transitions (from_status, to_status) values
  ('descartado', 'enriquecido')
on conflict do nothing;

-- 2. arquivamento: flag reversivel, fora da maquina de estados
alter table public.leads
  add column if not exists archived boolean not null default false;

comment on column public.leads.archived is
  'Arquivado pelo dono: some da lista por padrao, reversivel. Nao apaga (use DELETE para apagar de vez).';

create index if not exists leads_owner_archived_idx
  on public.leads (owner_id, archived);
