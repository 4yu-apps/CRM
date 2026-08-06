-- =====================================================================
-- Garimpo · linha do tempo do lead (Fatia 2 do CRM de gestao)
--
-- Ate aqui o sistema guardava DUAS coisas sobre o passado de um lead, e
-- nenhuma delas era o que um CRM de gestao precisa:
--
--   lead_status_history  o funil andou (bruto -> enriquecido -> ...)
--   leads.notes          um textarea que a proxima edicao sobrescreve
--
-- O que ninguem guardava: "liguei dia 12, falei com o Rafael, ele pediu
-- proposta com duas opcoes de escopo". Sem isso, quem assume a carteira nao
-- sabe nada, e o proprio dono esquece em duas semanas.
--
-- Pior: o campo notes tinha dois escritores brigando. A acao rapida do kanban
-- PREPENDIA "[dd/mm/aaaa] texto" (um log tosco) e o textarea da ficha
-- sobrescrevia tudo, apagando esse log em silencio. Com a tabela, cada um volta
-- a ter um dono: evento vai pra ca, anotacao livre sobre a conta fica no notes.
-- =====================================================================

create table if not exists public.lead_activities (
  id          uuid primary key default gen_random_uuid(),
  lead_id     uuid not null references public.leads (id) on delete cascade,
  -- Tipo do toque. TEXT com check, nao enum, de proposito: tipo de atividade
  -- muda com o uso, e valor novo em enum custa alterar a coluna em producao.
  kind        text not null default 'nota',
  body        text,
  -- Quando ACONTECEU, que nao e quando foi digitado: da pra registrar hoje uma
  -- ligacao de ontem. E por isso que a ordenacao da timeline usa este campo.
  happened_at timestamptz not null default now(),
  created_at  timestamptz not null default now(),

  constraint lead_activities_kind_check check (
    kind in ('ligacao', 'reuniao', 'mensagem', 'nota', 'proposta', 'outro')
  ),
  -- Atividade sem texto nenhum e linha vazia na timeline: nao serve pra nada.
  constraint lead_activities_body_check check (
    body is not null and length(btrim(body)) > 0
  )
);

comment on table public.lead_activities is
  'Linha do tempo do lead: o que foi feito e falado, com data. Complementa lead_status_history (que so conta o funil).';
comment on column public.lead_activities.happened_at is
  'Quando o toque aconteceu (pode ser no passado). A timeline ordena por aqui, nao por created_at.';

create index if not exists lead_activities_lead_idx
  on public.lead_activities (lead_id, happened_at desc);

-- ---------------------------------------------------------------------
-- Ultimo toque, desnormalizado na propria linha do lead.
--
-- A tela de Contatos carrega a base inteira em memoria e mostra uma linha por
-- lead. Buscar "ultimo toque" por lead dali sairia N+1, ou um join que o
-- PostgREST nao faz de graca. Uma coluna mantida por trigger resolve com zero
-- query extra, ao custo de uma desnormalizacao assumida e documentada.
--
-- NAO confundir com updated_at: aquele sobe quando alguem corrige o nome da
-- cidade. Este so sobe quando houve toque de verdade.
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists last_activity_at timestamptz;

comment on column public.leads.last_activity_at is
  'Data do toque mais recente em lead_activities. Mantida por trigger; nao editar a mao.';

create index if not exists leads_owner_last_activity_idx
  on public.leads (owner_id, last_activity_at desc nulls last);

create or replace function public.tg_sync_last_activity()
returns trigger language plpgsql as $$
declare
  v_lead uuid;
begin
  -- No delete o registro vem em OLD; nos demais, em NEW.
  v_lead := coalesce(new.lead_id, old.lead_id);
  -- Recalcula em vez de so comparar com o que chegou: assim apagar o toque mais
  -- recente devolve a data do anterior, em vez de deixar uma data fantasma.
  update public.leads l
     set last_activity_at = (
       select max(a.happened_at) from public.lead_activities a where a.lead_id = v_lead
     )
   where l.id = v_lead;
  return null;
end;
$$;

drop trigger if exists lead_activities_sync_last on public.lead_activities;
create trigger lead_activities_sync_last
  after insert or update or delete on public.lead_activities
  for each row execute function public.tg_sync_last_activity();

-- ---------------------------------------------------------------------
-- RLS: segue o dono do lead (mesmo padrao de lead_field_provenance).
-- Sem owner_id proprio de proposito: duas fontes de verdade sobre quem e o dono
-- e uma delas envelhecendo errado.
-- ---------------------------------------------------------------------
alter table public.lead_activities enable row level security;

drop policy if exists lead_activities_owner_all on public.lead_activities;
create policy lead_activities_owner_all on public.lead_activities
  for all
  to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ));

grant select, insert, update, delete on public.lead_activities to authenticated;
