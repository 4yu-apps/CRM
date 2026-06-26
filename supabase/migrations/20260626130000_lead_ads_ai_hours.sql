-- =====================================================================
-- Garimpo - 3 colunas pra enriquecer mais a ficha (tudo gratis):
--  fb_page_id   : page_id do Facebook resolvido (Ad Library) — guardado pra a
--                 proxima checagem ser direta/precisa, sem re-resolver o slug.
--  ai_signals   : leitura da IA (Gemini): {segment, maturity, maturity_note, pain}.
--  hours_struct : horario de atendimento normalizado pra calcular "aberto agora?"
--                 no front. Formato: {tz, days:{mon:[["0900","1800"]], ...}}.
-- Aditivo e idempotente. opening_hours (texto legivel) continua existindo.
-- =====================================================================

alter table public.leads
  add column if not exists fb_page_id text,
  add column if not exists ai_signals jsonb,
  add column if not exists hours_struct jsonb;

comment on column public.leads.fb_page_id is 'Page ID do Facebook (Ad Library), resolvido e guardado pra checagem direta.';
comment on column public.leads.ai_signals is 'Leitura da IA (Gemini): segment, maturity (1-5), maturity_note, pain.';
comment on column public.leads.hours_struct is 'Horario de atendimento normalizado: {tz, days:{mon:[["HHMM","HHMM"]],...}} pra calcular aberto/fechado agora.';
