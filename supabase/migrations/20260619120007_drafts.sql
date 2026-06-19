-- =====================================================================
-- Garimpo · Fase 3 · DRAFTS (rascunho de copy)
-- Colunas do rascunho de 2 mensagens no lead. A IA escreve; o humano edita e
-- aprova (qualificado -> rascunho_pronto -> aprovado). Envio sempre manual.
-- =====================================================================

alter table public.leads
  add column if not exists draft_msg1         text,
  add column if not exists draft_msg2         text,
  add column if not exists draft_model        text,         -- ex.: gemini-flash, mock
  add column if not exists draft_generated_at timestamptz;

comment on column public.leads.draft_msg1 is 'Rascunho — mensagem 1 (abertura). Editavel; nunca enviado pelo sistema.';
comment on column public.leads.draft_msg2 is 'Rascunho — mensagem 2 (pitch).';
comment on column public.leads.draft_model is 'Modelo que gerou o rascunho (proveniencia da copy).';
