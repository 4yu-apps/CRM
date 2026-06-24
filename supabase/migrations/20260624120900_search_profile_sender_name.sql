-- Nome de quem prospecta (auto-apresentacao na copy: "me chamo X, ..."). Coletado
-- no onboarding (obrigatorio apos o login). A esteira injeta isso na abertura.

alter table public.search_profile
  add column if not exists sender_name text;

-- Seed dos donos atuais (one-off; idempotente: so preenche se ainda vazio).
-- Eduardo opera varias contas (4yumkt, yamamoto, trafegodojapa, gab.feelix1).
update public.search_profile set sender_name = 'Gabriel'
  where owner_id = 'eba30f40-4752-4c3a-80bd-9aaa3c1dff27'
    and coalesce(sender_name, '') = '';
update public.search_profile set sender_name = 'Gustavo'
  where owner_id = '8a3ef9a8-e842-4983-86a4-ba56f534043c'
    and coalesce(sender_name, '') = '';
update public.search_profile set sender_name = 'Eduardo'
  where owner_id in (
    'b733cfa3-4c15-4056-b6d6-eebb631e792c',
    '7fdc2371-23a4-4f9f-822c-89be301a98ea',
    'b0c3b235-420a-4a7c-9a46-089286d9a2ed',
    '8597aa34-249c-43aa-9020-bc7926c48b25'
  ) and coalesce(sender_name, '') = '';
