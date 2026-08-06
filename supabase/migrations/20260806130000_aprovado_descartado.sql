-- =====================================================================
-- Garimpo · lead aprovado tambem pode ser descartado
--
-- Achado pelo teste espelho da maquina de estados (front x banco). O front
-- oferecia 'aprovado' -> 'descartado' e o kanban mostrava o chip "Descartado"
-- no card, mas o banco nao tinha essa transicao: quem clicasse levava um
-- "Transicao de status invalida" na cara, em producao.
--
-- Quem esta errado e o banco, nao a tela. 'rascunho_pronto' -> 'descartado' e
-- 'enviado' -> 'descartado' ("numero errado") ja existiam; 'aprovado' era o
-- unico estado do meio sem saida de descarte. Aprovar a copy e perceber depois
-- que o telefone esta errado, ou que a empresa fechou, e caso normal.
--
-- Aditivo e idempotente.
-- =====================================================================
insert into public.lead_status_transitions (from_status, to_status) values
  ('aprovado', 'descartado')
on conflict (from_status, to_status) do nothing;
