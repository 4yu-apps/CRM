-- =====================================================================
-- Garimpo - bairro/zona no perfil de busca
-- A tela Buscar deixa o dono focar a descoberta num bairro (ex: "Zona 7").
-- O bairro recentra o mapa e entra no termo de busca do robo ("nicho em
-- Bairro, Cidade, UF"). Em branco = cobre a cidade toda, como antes.
-- Aditivo e idempotente.
-- =====================================================================

alter table public.search_profile add column if not exists neighborhood text;
