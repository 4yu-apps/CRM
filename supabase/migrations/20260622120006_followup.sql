-- =====================================================================
-- Garimpo - follow-up MVP: data e mensagem do lembrete de follow-up.
-- followup_at: quando o dono quer ser lembrado de re-abordar o lead.
-- followup_note: mensagem sugerida para o follow-up.
-- Nao ha estado novo: o badge de lembrete e calculado no front
-- comparando followup_at com hoje.
-- =====================================================================
alter table public.leads
  add column if not exists followup_at  timestamptz null,
  add column if not exists followup_note text        null;
