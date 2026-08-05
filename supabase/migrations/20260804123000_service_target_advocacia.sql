-- =====================================================================
-- Garimpo - service_target ganha 'advocacia'. A area de advocacia entrou no
-- front (professions.ts, defaultService: "advocacia") sem o valor no enum,
-- entao salvar o perfil dava "invalid input value for enum service_target".
-- Mesmo padrao das migrations de design/marketing: aditivo e idempotente.
-- =====================================================================
alter type public.service_target add value if not exists 'advocacia';
