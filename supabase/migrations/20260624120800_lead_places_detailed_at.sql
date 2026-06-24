-- Carimbo de quando o lead recebeu enriquecimento via Google Places Details
-- (telefone/site pelo place_id). Serve de CONTADOR da cota diaria: o sistema
-- conta quantos leads foram "detalhados" hoje e para de chamar a API quando bate
-- o limite (Places Details com telefone = SKU Enterprise, 1.000 gratis/mes ~=
-- 30/dia). Evita estourar a cota paga do Maps.

alter table public.leads
  add column if not exists places_detailed_at timestamptz;

create index if not exists leads_places_detailed_at_idx
  on public.leads (places_detailed_at)
  where places_detailed_at is not null;
