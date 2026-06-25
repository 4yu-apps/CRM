-- =====================================================================
-- Garimpo - sinais sociais e de anuncio prontos para exibicao na ficha.
-- Espelha site_signals: a esteira mantem um retrato jsonb agregado sem
-- depender de varias consultas de proveniencia no front.
-- =====================================================================

alter table public.leads
  add column if not exists social_signals jsonb;

comment on column public.leads.social_signals is
  'Retrato agregado de Instagram e anuncios: followers, media_count, last_post, post_freq, post_freq_label, engagement, ig_status, ads_active, ads_count, ads_since, ad_platforms.';
