-- =====================================================================
-- Garimpo - sinais tecnicos do site + cobertura de contatos no lead.
-- A esteira ja baixa o HTML do site pra raspar contato; agora extrai de graca
-- tambem o diagnostico tecnico (Pixel do Facebook / tag do Google = "ja
-- anuncia?", widget de chat, formulario, mobile, peso, stack, og...). Isso
-- alimenta o score por profissao (tarfego/automacao/design/marketing) e a
-- ficha, SEM API paga e SEM a Biblioteca de Anuncios da Meta.
-- match_rate: cobertura de contatos achados (0..1), pro badge de "lead pobre".
-- Aditivo e idempotente.
-- =====================================================================
alter table public.leads add column if not exists site_signals jsonb;
alter table public.leads add column if not exists match_rate numeric;

comment on column public.leads.site_signals is
  'Diagnostico tecnico do site (de graca, do HTML): has_fb_pixel, has_google_tag, has_chat_widget, chat_vendor, has_form, mobile_ready, page_kb, slow, stack, https, has_h1, has_title, has_description, og_image.';
comment on column public.leads.match_rate is
  'Cobertura de contatos achados no enriquecimento (0..1). Badge de lead pobre.';
