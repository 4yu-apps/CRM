-- =====================================================================
-- Garimpo · B1 (dois servicos) + B8 (precificacao) · service_target + valor
-- B1: o lead passa a ter um servico-alvo (trafego x automacao x ambos), mais
--     o sinal "ja anuncia?" como coluna (a esteira preenche; antes so vivia na
--     proveniencia). Espelha ServiceTarget no front e em models.py.
-- B8: campos opcionais de negociacao. Nao travam o funil; ajudam a fechar.
--     anotacao livre, valor sugerido pela IA (+motivo) e o valor fechado.
-- Tudo aditivo e idempotente (enum guardado, add column if not exists).
-- =====================================================================

-- ---------------------------------------------------------------------
-- B1 · servico-alvo do lead
-- ---------------------------------------------------------------------
do $$ begin
  create type public.service_target as enum
    ('trafego', 'automacao', 'ambos', 'indefinido');
exception when duplicate_object then null; end $$;

alter table public.leads
  add column if not exists service_target public.service_target
    not null default 'indefinido',
  add column if not exists ads_active boolean;   -- null = desconhecido

comment on column public.leads.service_target is
  'B1: servico-alvo decidido pelo score (trafego/automacao/ambos/indefinido).';
comment on column public.leads.ads_active is
  'Sinal "ja anuncia?": true/false/null(desconhecido). Pesa no score de trafego.';

-- ---------------------------------------------------------------------
-- B8 · precificacao e sugestao de valor (opcional)
-- ---------------------------------------------------------------------
do $$ begin
  create type public.deal_billing as enum ('mensal_fixo', 'por_prazo');
exception when duplicate_object then null; end $$;

alter table public.leads
  add column if not exists notes                  text,
  add column if not exists suggested_value        numeric(12,2),
  add column if not exists suggested_value_reason text,
  add column if not exists deal_value             numeric(12,2),
  add column if not exists deal_billing           public.deal_billing,
  add column if not exists deal_term_months       integer,
  add column if not exists deal_closed_at         timestamptz;

comment on column public.leads.notes is
  'B8: anotacoes livres da conversa (condicoes de investimento, observacoes).';
comment on column public.leads.suggested_value is
  'B8: valor mensal sugerido pela IA (localizacao + porte + servico + notes).';
comment on column public.leads.suggested_value_reason is
  'B8: motivo escrito da sugestao. Sempre sugestao; o humano decide.';
comment on column public.leads.deal_value is
  'B8: valor fechado de fato (entra na receita real dos Resultados).';
comment on column public.leads.deal_billing is
  'B8: tipo de cobranca do valor fechado (mensal fixo ou por prazo X meses).';
comment on column public.leads.deal_term_months is
  'B8: prazo em meses quando deal_billing = por_prazo.';
comment on column public.leads.deal_closed_at is
  'B8: quando fechou (carimbo do valor fechado).';

do $$ begin
  alter table public.leads
    add constraint leads_suggested_value_nonneg
      check (suggested_value is null or suggested_value >= 0),
    add constraint leads_deal_value_nonneg
      check (deal_value is null or deal_value >= 0),
    add constraint leads_deal_term_pos
      check (deal_term_months is null or deal_term_months > 0);
exception when duplicate_object then null; end $$;
