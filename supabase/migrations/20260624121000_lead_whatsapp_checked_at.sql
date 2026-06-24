-- Marca quando a extensao validou se o numero tem WhatsApp.
-- Nulo = ainda nao checado. Com a tag sem-whatsapp = nao tem. Sem a tag = tem.
alter table public.leads
  add column if not exists whatsapp_checked_at timestamptz;
