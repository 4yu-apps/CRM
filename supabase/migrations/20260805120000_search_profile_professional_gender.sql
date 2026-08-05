-- =====================================================================
-- Garimpo - flexao do substantivo da profissao na copy.
--
-- "Me chamo Helena Costa, sou advogado" saia assim pra toda advogada: o
-- substantivo estava fixo no masculino na esteira. Erro de concordancia no
-- nome da propria dona da conta, na PRIMEIRA mensagem a um cliente.
--
-- A escolha e explicita (a pessoa marca na config), nunca inferida pelo primeiro
-- nome. NULL mantem o masculino, que era o comportamento antes deste campo —
-- quem ja configurou nao muda de copy sem pedir.
-- =====================================================================

alter table public.search_profile
  add column if not exists professional_gender text;

do $$ begin
  alter table public.search_profile
    add constraint search_profile_professional_gender_check
      check (professional_gender is null or professional_gender in ('f', 'm'));
exception when duplicate_object then null; end $$;

comment on column public.search_profile.professional_gender is
  'Flexao do substantivo da profissao na copy: f = advogada, m = advogado. '
  'NULL = masculino (compatibilidade). Escolhido pela pessoa, nunca inferido.';
