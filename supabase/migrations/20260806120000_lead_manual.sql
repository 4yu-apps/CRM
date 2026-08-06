-- =====================================================================
-- Garimpo · lead cadastrado a mao
-- O dono digita um lead (ou um cliente que ele ja tem) direto no CRM. Esse
-- registro entra em 'bruto' como qualquer outro e a esteira pega ele no
-- fetch_by_status('bruto'). Sem marca nenhuma, o score podia DESCARTAR o que a
-- pessoa acabou de digitar: ela cadastra, sai pra almocar, volta e o lead sumiu.
--
-- A marca resolve isso sem tirar o enriquecimento (que e o diferencial): o robo
-- completa e pontua o lead manual, mas nunca o descarta.
-- =====================================================================

alter table public.leads
  add column if not exists manual boolean not null default false;

comment on column public.leads.manual is
  'Cadastrado a mao pelo dono (nao veio da descoberta). A esteira enriquece e pontua, mas nunca descarta: quem digitou ja decidiu que interessa.';
