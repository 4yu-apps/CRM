-- =====================================================================
-- Garimpo - service_target ganha 'design' e 'marketing'. Antes so existia
-- trafego/automacao/ambos/indefinido, entao leads de UX/web e de social caiam
-- em "A definir" e a precificacao usava tabela de trafego. Agora a profissao
-- amarra de ponta a ponta: o lead carrega o alvo certo (badge proprio) e o
-- pricing usa a tabela do servico. Aditivo e idempotente.
-- =====================================================================
alter type public.service_target add value if not exists 'design';
alter type public.service_target add value if not exists 'marketing';
