-- =====================================================================
-- Garimpo - motivo de perda (#17).
-- loss_reason: por que o lead foi perdido/arquivado (preco, sem orcamento,
-- concorrente, sumiu, sem fit, ...). Preenchido no modal ao arquivar no
-- funil. Usado depois em relatorio de perdas (#16).
-- =====================================================================
alter table public.leads
  add column if not exists loss_reason text null;
