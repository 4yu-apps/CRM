-- =====================================================================
-- Garimpo - funil mais flexivel + onboarding por profissao
-- (1) O kanban deixa arrastar o card pra frente (pular estagios): a maquina
--     de estados rigida bloqueava, o que fazia o lead "sumir" ao arrastar pra
--     Reuniao. Aqui liberamos as transicoes forward que o kanban oferece.
-- (2) Reativar um lead arquivado volta pra Novo (rascunho_pronto), VISIVEL no
--     kanban. Antes ia pra 'enriquecido' (status interno, invisivel) = sumia.
-- (3) search_profile.profession: a area do usuario (trafego, automacao, design,
--     marketing...), escolhida no onboarding, pra sugerir nicho/servico.
-- Tudo aditivo e idempotente.
-- =====================================================================

-- (1) + (2) transicoes que o kanban precisa (forward + reativar pra Novo)
insert into public.lead_status_transitions (from_status, to_status) values
  ('aprovado','respondeu'), ('aprovado','interessado'), ('aprovado','reuniao'), ('aprovado','fechado'),
  ('enviado','interessado'), ('enviado','reuniao'), ('enviado','fechado'),
  ('respondeu','fechado'),
  ('interessado','fechado'),
  ('reuniao','fechado'),
  ('descartado','rascunho_pronto'),
  ('sem_interesse','rascunho_pronto'),
  ('perdido','rascunho_pronto')
on conflict (from_status, to_status) do nothing;

-- (3) profissao/area do usuario (onboarding multi-vertical)
alter table public.search_profile add column if not exists profession text;
