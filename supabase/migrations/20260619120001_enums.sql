-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 1/6 · ENUMS
-- Tipos base. A maquina de estados do lead vive aqui (secao 6 do mapa).
-- =====================================================================

-- Ciclo de vida do lead. Ordem = caminho feliz do funil.
-- Saidas terminais: descartado, sem_interesse, fechado, perdido.
create type public.lead_status as enum (
  'bruto',            -- captado, ainda nao processado
  'enriquecido',      -- cascata Python preencheu campos
  'qualificado',      -- passou no score contra o ICP
  'descartado',       -- saida: nao serve / numero errado / junk
  'rascunho_pronto',  -- IA escreveu msg 1 e 2; aguarda humano
  'aprovado',         -- humano aprovou a copy  [portao humano]
  'enviado',          -- humano disparou no WhatsApp [portao humano]
  'sem_resposta',     -- enviado, sem retorno -> loop de follow-up
  'respondeu',        -- lead respondeu
  'sem_interesse',    -- saida: respondeu negando
  'interessado',      -- respondeu com interesse
  'reuniao',          -- reuniao marcada
  'proposta',         -- proposta enviada
  'fechado',          -- saida: ganhou (✓)
  'perdido'           -- saida: perdeu
);

-- Proveniencia: qual fonte achou cada campo (secao 3 do mapa — cidadao de 1a classe).
create type public.lead_source as enum (
  'google_maps',
  'cnpj_brasilapi',
  'cnpj_ws',
  'instagram',
  'website',
  'meta_ad_library',
  'manual',           -- digitado pelo humano no front
  'extension'         -- veio pela extensao do WhatsApp
);

-- Quem/o que executou uma mudanca de status (auditoria do funil).
create type public.actor_type as enum (
  'human',            -- humano no front / extensao
  'system',           -- esteira Python (GitHub Actions)
  'extension'         -- clique na extensao do WhatsApp
);
