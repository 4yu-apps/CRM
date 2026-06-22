-- Migration: adiciona meeting_gcal_event_id em leads para vincular ao evento do
-- Google Calendar criado no momento do agendamento. Permite cancelar o evento no
-- Google quando a reuniao for desmarcada.
--
-- Idempotente: usa "add column if not exists".

alter table public.leads
  add column if not exists meeting_gcal_event_id text;

comment on column public.leads.meeting_gcal_event_id is
  'ID do evento criado no Google Calendar (calendar v3). Usado para cancelar '
  'o evento quando a reuniao for desmarcada. Pode ser nulo quando a criacao '
  'do evento falhou ou o usuario nao conectou o Google.';
