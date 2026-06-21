-- =====================================================================
-- Garimpo - campos de reuniao no lead (agenda + notificacoes)
-- A reuniao deixa de viver so como texto na nota: ganha hora, modalidade e
-- onde acontece. meeting_link (online: Meet/Zoom/Teams) OU meeting_location
-- (presencial: endereco). A Agenda e o sininho leem meeting_at. Aditivo.
-- =====================================================================

alter table public.leads add column if not exists meeting_at timestamptz;
alter table public.leads add column if not exists meeting_link text;
alter table public.leads add column if not exists meeting_location text;
