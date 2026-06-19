-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 5/6 · FUNCOES + TRIGGERS
-- updated_at, carimbo de opt-out, validacao da maquina de estados,
-- guarda LGPD, log automatico de historico e RPC transition_lead.
-- =====================================================================

-- ---------------------------------------------------------------------
-- updated_at automatico
-- ---------------------------------------------------------------------
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger leads_set_updated_at
  before update on public.leads
  for each row execute function public.tg_set_updated_at();

-- ---------------------------------------------------------------------
-- Carimbo de opt-out (LGPD): marca/desmarca opt_out_at automaticamente
-- ---------------------------------------------------------------------
create or replace function public.tg_stamp_opt_out()
returns trigger language plpgsql as $$
begin
  if new.opt_out and (old.opt_out is distinct from true) then
    new.opt_out_at := now();
  elsif not new.opt_out then
    new.opt_out_at := null;
  end if;
  return new;
end;
$$;

create trigger leads_stamp_opt_out
  before insert or update on public.leads
  for each row execute function public.tg_stamp_opt_out();

-- ---------------------------------------------------------------------
-- Validacao da maquina de estados + guarda LGPD (BEFORE UPDATE)
-- - transicao tem que existir em lead_status_transitions
-- - lead com opt-out nao avanca para contato (rascunho/aprovado/enviado)
-- ---------------------------------------------------------------------
create or replace function public.tg_validate_status_change()
returns trigger language plpgsql as $$
begin
  if new.status is distinct from old.status then
    if not exists (
      select 1 from public.lead_status_transitions t
      where t.from_status = old.status
        and t.to_status   = new.status
    ) then
      raise exception 'Transicao de status invalida: % -> %', old.status, new.status
        using errcode = 'check_violation';
    end if;

    if (new.opt_out or old.opt_out)
       and new.status in ('rascunho_pronto', 'aprovado', 'enviado') then
      raise exception 'Lead com opt-out (LGPD) nao pode ir para %: contato bloqueado', new.status
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

create trigger leads_validate_status
  before update on public.leads
  for each row execute function public.tg_validate_status_change();

-- ---------------------------------------------------------------------
-- Log automatico de historico (AFTER INSERT/UPDATE)
-- Ator e nota vem de settings locais da transacao (set por transition_lead),
-- com fallback para 'system' (esteira Python).
-- ---------------------------------------------------------------------
create or replace function public.tg_log_status_history()
returns trigger language plpgsql as $$
declare
  v_actor public.actor_type;
  v_note  text;
begin
  v_actor := coalesce(
    nullif(current_setting('garimpo.actor', true), '')::public.actor_type,
    'system'
  );
  v_note := nullif(current_setting('garimpo.note', true), '');

  if tg_op = 'INSERT' then
    insert into public.lead_status_history
      (lead_id, from_status, to_status, actor, changed_by, note)
    values
      (new.id, null, new.status, v_actor, auth.uid(), v_note);
    return new;
  end if;

  if new.status is distinct from old.status then
    insert into public.lead_status_history
      (lead_id, from_status, to_status, actor, changed_by, note)
    values
      (new.id, old.status, new.status, v_actor, auth.uid(), v_note);
  end if;
  return new;
end;
$$;

create trigger leads_log_status_history
  after insert or update on public.leads
  for each row execute function public.tg_log_status_history();

-- ---------------------------------------------------------------------
-- RPC transition_lead — API limpa para front/extensao mudarem status.
-- Carrega ator/nota nos settings locais (lidos pelo trigger de historico),
-- aplica o update (validacao + log disparam) e retorna o lead.
-- SECURITY INVOKER: respeita RLS (so o dono mexe no proprio lead).
-- ---------------------------------------------------------------------
create or replace function public.transition_lead(
  p_lead_id    uuid,
  p_new_status public.lead_status,
  p_actor      public.actor_type default 'human',
  p_note       text default null
)
returns public.leads
language plpgsql
security invoker
as $$
declare
  v_lead public.leads;
begin
  perform set_config('garimpo.actor', p_actor::text, true);  -- local a transacao
  perform set_config('garimpo.note', coalesce(p_note, ''), true);

  update public.leads
     set status = p_new_status
   where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'Lead % nao encontrado (ou sem permissao)', p_lead_id
      using errcode = 'no_data_found';
  end if;

  return v_lead;
end;
$$;

comment on function public.transition_lead is
  'Muda o status de um lead validando a maquina de estados e gravando historico. Use no lugar de UPDATE direto no front/extensao.';
