-- =====================================================================
-- Garimpo - area de advocacia no perfil de busca.
--
-- legal_areas pesa os criterios do score na esteira E define COMO o
-- advogado se apresenta na copy ("atuo na area trabalhista, com empresas
-- que tem funcionarios"). oab_number + oab_uf assinam o e-mail; sem eles
-- o prompt proibe inventar numero.
-- =====================================================================

alter table public.search_profile
  add column if not exists legal_areas text[] default '{}'::text[],
  add column if not exists oab_number text,
  add column if not exists oab_uf text;

comment on column public.search_profile.legal_areas is
  'Areas de atuacao juridica: trabalhista, tributario, societario, consumidor, lgpd.';
comment on column public.search_profile.oab_number is
  'Numero de inscricao na OAB, usado na assinatura do e-mail rascunhado.';
comment on column public.search_profile.oab_uf is
  'Seccional da OAB (UF) do advogado.';
