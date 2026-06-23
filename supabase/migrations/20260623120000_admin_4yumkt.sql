-- =====================================================================
-- Garimpo - admin adicional: 4yumkt@gmail.com tambem gerencia todos os
-- perfis pela tela /admin. Aditivo e idempotente: so liga a flag is_admin
-- no perfil desse usuario (o gate real mora no servidor, em /api/admin).
-- =====================================================================
update public.search_profile set is_admin = true
  where owner_id = (select id from auth.users where email = '4yumkt@gmail.com');
