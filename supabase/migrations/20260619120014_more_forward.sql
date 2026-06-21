-- =====================================================================
-- Garimpo - mais transicoes forward do kanban (de Novo e de Sem-resposta).
-- Completa a liberacao do arrasta-pra-frente: um lead recem-chegado (Novo /
-- rascunho_pronto) ja pode ir direto pra Reuniao, Fechou, etc. Aditivo e
-- idempotente.
-- =====================================================================
insert into public.lead_status_transitions (from_status, to_status) values
  ('rascunho_pronto','enviado'), ('rascunho_pronto','respondeu'),
  ('rascunho_pronto','interessado'), ('rascunho_pronto','reuniao'), ('rascunho_pronto','fechado'),
  ('sem_resposta','respondeu'), ('sem_resposta','interessado'),
  ('sem_resposta','reuniao'), ('sem_resposta','fechado')
on conflict (from_status, to_status) do nothing;
