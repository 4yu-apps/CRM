-- =====================================================================
-- Garimpo - situacao cadastral da empresa (Fase 4, nao prospectar negocio morto)
-- Vem da Receita via CNPJ (BrasilAPI descricao_situacao_cadastral / ReceitaWS
-- situacao). Empresa nao-ATIVA (BAIXADA/INAPTA/SUSPENSA/NULA) = corte duro no
-- score. So preenche quando ha CNPJ (raspado do site ou da extensao/manual).
-- Aditivo e idempotente.
-- =====================================================================

alter table public.leads
  add column if not exists company_status text;

comment on column public.leads.company_status is
  'Situacao cadastral na Receita (ATIVA/BAIXADA/INAPTA/SUSPENSA/NULA). Nao-ATIVA = descartado no score.';
