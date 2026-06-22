-- =====================================================================
-- Garimpo - super admin. Um dono pode ser marcado como admin pra gerenciar
-- todos os perfis (ver leads, ultima atividade, trocar login/senha, excluir).
-- O gate real mora no servidor (rotas /api/admin com service_role que conferem
-- este flag pelo JWT do chamador). Aditivo e idempotente.
-- =====================================================================
alter table public.search_profile add column if not exists is_admin boolean not null default false;

-- gab.feelix@gmail.com = super admin inicial
update public.search_profile set is_admin = true
  where owner_id = 'eba30f40-4752-4c3a-80bd-9aaa3c1dff27';

comment on column public.search_profile.is_admin is
  'Super admin: gerencia todos os perfis pela tela /admin (gate no servidor).';
