-- =====================================================================
-- Garimpo - WhatsApp e Facebook no lead (enriquecimento+ do site)
-- O telefone do Maps nem sempre e o WhatsApp; agora guardamos o zap separado.
-- O Facebook (pagina) e a ponte pro page_id da Meta Ad Library, pra saber
-- "ja anuncia?" de forma confiavel (busca por pagina, nao por nome).
-- A esteira raspa ambos do rodape do site. Aditivo e idempotente.
-- =====================================================================

alter table public.leads add column if not exists whatsapp text;
alter table public.leads add column if not exists facebook text;
