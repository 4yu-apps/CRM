-- =====================================================================
-- Garimpo - fonte biz_signals no enum lead_source. Sinais gratuitos de
-- maturidade: tipo do telefone, DNS MX e idade do dominio via RDAP.
-- =====================================================================

alter type public.lead_source add value if not exists 'biz_signals';
