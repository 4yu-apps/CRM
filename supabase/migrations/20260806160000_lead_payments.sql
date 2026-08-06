-- =====================================================================
-- Garimpo · recebimentos (Fatia 5 do CRM de gestao)
--
-- Ate aqui `leads.deal_value` respondia UMA pergunta e o app fingia que ela
-- respondia tres:
--
--   contratado   quanto foi combinado          <- e so isso que deal_value e
--   faturado     quanto foi cobrado
--   recebido     quanto entrou na conta
--
-- Um cliente de R$1.500/mes fechado em janeiro aparecia como R$1.500 no MRR em
-- agosto mesmo sem ter pago desde marco. O numero nao estava errado por bug:
-- estava respondendo outra pergunta. Quem olha o CRM pra saber se o mes fechou
-- precisa da terceira.
--
-- O que esta tabela NAO e, de proposito: nao e parcelamento, nao emite boleto,
-- nao gera nota, nao fala com banco. Ela e um caderninho de "entrou tanto, dia
-- tanto, cobre ate tal dia". O teto de R$30/mes do produto nao paga integracao
-- bancaria, e um financeiro de verdade e outro produto.
-- =====================================================================

create table if not exists public.lead_payments (
  id           uuid primary key default gen_random_uuid(),
  lead_id      uuid not null references public.leads (id) on delete cascade,

  -- Quanto entrou. Pode divergir do deal_value: desconto, mes cheio, ajuste.
  -- Guardar o valor no recebimento (e nao multiplicar deal_value por meses na
  -- hora de somar) e o que impede o total de mentir quando o preco muda.
  amount       numeric(12,2) not null,

  -- Quando o dinheiro ENTROU. E a data que soma "recebido em agosto".
  -- Separada do created_at pelo mesmo motivo do happened_at das atividades: da
  -- pra registrar hoje um pix que caiu semana passada.
  paid_on      date not null default current_date,

  -- Ate quando este recebimento cobre o contrato. NULL de proposito quando a
  -- pergunta nao faz sentido: um contrato por prazo pago de uma vez, ou um
  -- servico avulso, entrou dinheiro mas nao ha "mes coberto".
  -- E daqui que sai leads.paid_until.
  covers_until date,

  note         text,
  created_at   timestamptz not null default now(),

  -- Recebimento de zero nao e recebimento, e negativo seria estorno, que e
  -- outra coisa e ainda nao existe aqui. Melhor recusar do que guardar um
  -- numero que ninguem sabe ler depois.
  constraint lead_payments_amount_pos check (amount > 0)
);

comment on table public.lead_payments is
  'Caderninho de recebimentos: quanto entrou, quando, e ate quando cobre. Nao e faturamento nem parcelamento.';
comment on column public.lead_payments.paid_on is
  'Quando o dinheiro entrou (pode ser no passado). "Recebido no mes" soma por aqui.';
comment on column public.lead_payments.covers_until is
  'Ate quando o contrato fica pago com este recebimento. NULL = avulso, nao mexe em leads.paid_until.';

create index if not exists lead_payments_lead_idx
  on public.lead_payments (lead_id, paid_on desc);

-- ---------------------------------------------------------------------
-- "Pago ate", desnormalizado na linha do lead.
--
-- Mesma justificativa de last_activity_at: Clientes e Contatos carregam a base
-- inteira em memoria e perguntam isso por linha. Um join por lead sairia N+1.
--
-- E mesma disciplina: o trigger RECALCULA a partir do max, em vez de comparar
-- com o que acabou de chegar. Registrar um recebimento com data errada e apagar
-- depois tem que devolver a data anterior, nao deixar o cliente eternamente "em
-- dia" por causa de uma linha que nao existe mais.
-- ---------------------------------------------------------------------
alter table public.leads
  add column if not exists paid_until date;

comment on column public.leads.paid_until is
  'Ate quando o cliente esta pago. Mantida por trigger a partir de lead_payments; nao editar a mao. NULL = ninguem esta acompanhando recebimento deste cliente (nao significa caloteiro).';

create index if not exists leads_owner_paid_until_idx
  on public.leads (owner_id, paid_until nulls last);

create or replace function public.tg_sync_paid_until()
returns trigger language plpgsql as $$
declare
  v_lead uuid;
begin
  v_lead := coalesce(new.lead_id, old.lead_id);
  update public.leads l
     set paid_until = (
       select max(p.covers_until)
         from public.lead_payments p
        where p.lead_id = v_lead
     )
   where l.id = v_lead;
  return null;
end;
$$;

drop trigger if exists lead_payments_sync_paid_until on public.lead_payments;
create trigger lead_payments_sync_paid_until
  after insert or update or delete on public.lead_payments
  for each row execute function public.tg_sync_paid_until();

-- ---------------------------------------------------------------------
-- RLS: segue o dono do lead, igual lead_activities. Sem owner_id proprio, pra
-- nao existirem duas fontes de verdade sobre quem e o dono.
-- ---------------------------------------------------------------------
alter table public.lead_payments enable row level security;

drop policy if exists lead_payments_owner_all on public.lead_payments;
create policy lead_payments_owner_all on public.lead_payments
  for all
  to authenticated
  using (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ))
  with check (exists (
    select 1 from public.leads l
    where l.id = lead_id and l.owner_id = auth.uid()
  ));

grant select, insert, update, delete on public.lead_payments to authenticated;
