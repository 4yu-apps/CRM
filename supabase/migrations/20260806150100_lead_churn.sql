-- =====================================================================
-- Garimpo · churn: transicoes e o registro da saida
--
-- Segunda metade do estado 'cancelado' (o valor do enum entrou no arquivo
-- anterior; usar na mesma transacao em que ele nasce e recusado pelo Postgres).
--
-- Cancelar NAO passa pelo funil. Cliente que saiu nao e lead perdido: misturar
-- os dois sujaria a taxa de fechamento, que existe pra medir prospeccao. A saida
-- se registra na ficha e na tela de Clientes.
--
-- A volta existe porque cliente que cancelou volta: 'cancelado' -> 'fechado'
-- reativa sem inventar um lead novo, preservando historico e valor.
-- =====================================================================

insert into public.lead_status_transitions (from_status, to_status) values
  ('fechado',   'cancelado'),
  ('cancelado', 'fechado')
on conflict (from_status, to_status) do nothing;

alter table public.leads
  add column if not exists churn_at     timestamptz,
  add column if not exists churn_reason text;

comment on column public.leads.churn_at is
  'Quando o cliente saiu. Separado de updated_at pra sobreviver a qualquer edicao posterior.';
comment on column public.leads.churn_reason is
  'Por que saiu (preco, sem resultado, trocou de fornecedor, fechou a empresa, outro). A licao do churn e mais util que o numero.';

-- Encerrados nao somem da tela, viram aba propria ordenada pela saida.
create index if not exists leads_owner_churn_idx
  on public.leads (owner_id, churn_at desc)
  where churn_at is not null;
