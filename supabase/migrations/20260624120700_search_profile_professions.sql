-- Multi-profissao: o dono pode oferecer mais de um servico (ex.: trafego +
-- automacao + design). A nova coluna 'professions' (array) e a fonte da verdade;
-- a coluna antiga 'profession' (singular) segue preenchida com a PRIMEIRA escolha
-- pra compatibilidade durante o rollout (front/esteira velhos ainda leem ela).

alter table public.search_profile
  add column if not exists professions text[] not null default '{}';

-- backfill: quem ja tinha uma profissao unica vira um array de um elemento.
update public.search_profile
set professions = array[profession]
where profession is not null
  and profession <> ''
  and coalesce(array_length(professions, 1), 0) = 0;
