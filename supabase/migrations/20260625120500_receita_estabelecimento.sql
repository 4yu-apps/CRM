-- =====================================================================
-- Garimpo - Receita (Dados Abertos) local: name->CNPJ robusto e gratis (Fase 5.5b)
-- Subset dos municipios prospectados, carregado por um loader operacional (o dono
-- roda; nao e o cron). O autopilot consulta por nome+cidade via RPC com trigram.
-- Reference data: RLS ligado sem policy (so service_role le; o front nao toca).
-- Aditivo e idempotente.
-- =====================================================================

create extension if not exists pg_trgm;

create table if not exists public.receita_estabelecimento (
  cnpj text primary key,                 -- 14 digitos
  razao_social text,
  nome_fantasia text,
  situacao text,                         -- ATIVA/BAIXADA/INAPTA/SUSPENSA/NULA
  data_inicio date,
  cnae text,
  logradouro text,
  numero text,
  bairro text,
  municipio text,                        -- nome (uppercase, sem acento, como na Receita)
  uf text,
  cep text,
  telefone text,                         -- DDD+numero, so digitos
  email text,
  updated_at timestamptz default now()
);

create index if not exists receita_razao_trgm
  on public.receita_estabelecimento using gin (razao_social gin_trgm_ops);
create index if not exists receita_fantasia_trgm
  on public.receita_estabelecimento using gin (nome_fantasia gin_trgm_ops);
create index if not exists receita_uf_municipio
  on public.receita_estabelecimento (uf, municipio);

alter table public.receita_estabelecimento enable row level security;

-- Busca por nome com similaridade (pg_trgm), filtrada por UF/municipio. O operador
-- % usa o indice trgm (limiar pg_trgm.similarity_threshold, padrao 0.3); o
-- pick_cnpj na esteira faz a validacao cruzada final (telefone/cidade/bairro/nome).
create or replace function public.receita_search(
  p_nome text, p_uf text default null, p_municipio text default null
)
returns setof public.receita_estabelecimento
language sql
stable
as $$
  select e.*
  from public.receita_estabelecimento e
  where (p_uf is null or e.uf = upper(p_uf))
    and (p_municipio is null or e.municipio ilike p_municipio)
    and (e.razao_social % p_nome or coalesce(e.nome_fantasia, '') % p_nome)
  order by greatest(
    similarity(coalesce(e.razao_social, ''), p_nome),
    similarity(coalesce(e.nome_fantasia, ''), p_nome)
  ) desc
  limit 20
$$;

grant execute on function public.receita_search(text, text, text) to service_role;
