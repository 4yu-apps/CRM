-- =====================================================================
-- Garimpo - rascunho de e-mail. Canal adicional da area de advocacia:
-- registro formal, com assinatura e OAB. WhatsApp frio de advogado e a
-- forma mais exposta de aparecer; o e-mail institucional cabe melhor.
-- Sem envio automatico, igual ao WhatsApp: o humano copia e manda.
-- =====================================================================

alter table public.leads
  add column if not exists draft_email_subject text,
  add column if not exists draft_email_body text;

comment on column public.leads.draft_email_subject is
  'Assunto do e-mail rascunhado (area de advocacia).';
comment on column public.leads.draft_email_body is
  'Corpo do e-mail rascunhado, com assinatura e OAB (area de advocacia).';
