-- =====================================================================
-- Garimpo - controle do robo: score minimo (#19 da Fase 7).
-- min_score: nota minima (0..100) pra um lead entrar na fila. A esteira
-- (Python) le isso por dono e, alem do THRESHOLD global, descarta abaixo
-- desse piso. Default 0 = comportamento atual (sem filtro extra).
-- =====================================================================
alter table public.search_profile
  add column if not exists min_score int not null default 0;
