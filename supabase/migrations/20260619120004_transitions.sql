-- =====================================================================
-- Garimpo · Fase 0 (Fundacao) · 4/6 · MAQUINA DE ESTADOS (transicoes)
-- Tabela data-driven com as transicoes permitidas. Editar aqui muda as
-- regras sem tocar em codigo (principio 5: mantivel).
-- Os botoes contextuais da extensao saem destas linhas (secao 6 do mapa).
-- =====================================================================

create table public.lead_status_transitions (
  from_status public.lead_status not null,
  to_status   public.lead_status not null,
  primary key (from_status, to_status)
);

comment on table public.lead_status_transitions is
  'Transicoes permitidas do funil. Validadas por trigger em leads.';

insert into public.lead_status_transitions (from_status, to_status) values
  -- esteira automatica
  ('bruto',           'enriquecido'),
  ('bruto',           'descartado'),       -- junk / duplicata detectada cedo
  ('enriquecido',     'qualificado'),
  ('enriquecido',     'descartado'),
  ('qualificado',     'rascunho_pronto'),
  ('qualificado',     'descartado'),
  ('rascunho_pronto', 'descartado'),
  -- portao humano
  ('rascunho_pronto', 'aprovado'),
  ('aprovado',        'enviado'),
  -- pos-envio (botoes da extensao: [Respondeu] [Sem resposta] [Numero errado])
  ('enviado',         'respondeu'),
  ('enviado',         'sem_resposta'),
  ('enviado',         'descartado'),        -- "numero errado" mapeia aqui
  ('sem_resposta',    'enviado'),           -- loop de follow-up
  ('sem_resposta',    'descartado'),
  -- pos-resposta (botoes: [Interessado] [Agendou reuniao] [Sem interesse])
  ('respondeu',       'interessado'),
  ('respondeu',       'sem_interesse'),
  ('respondeu',       'reuniao'),           -- agendou ja na 1a resposta
  -- negociacao (botoes: [Reuniao] [Proposta] [Perdido])
  ('interessado',     'reuniao'),
  ('interessado',     'proposta'),
  ('interessado',     'perdido'),
  ('reuniao',         'proposta'),
  ('reuniao',         'perdido'),
  ('proposta',        'fechado'),
  ('proposta',        'perdido');
