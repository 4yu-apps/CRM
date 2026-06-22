-- =====================================================================
-- Garimpo - funil permite VOLTAR (corrigir erro de arraste).
-- A maquina de estados so tinha transicoes "forward". Mover um card pra tras
-- (ex: caiu em Respondeu sem querer, ou de Interessado pra Respondeu) era
-- bloqueado pelo trigger -> "Esse passo nao e valido a partir do estagio atual".
-- Nao ha motivo pra travar uma correcao. Aqui liberamos qualquer transicao
-- LATERAL/BACKWARD entre os estagios ATIVOS do funil (os que o kanban mostra
-- como coluna de destino: aprovado, enviado, respondeu, interessado, reuniao,
-- fechado), a partir de qualquer status ativo. A guarda LGPD (opt_out) continua
-- valendo no trigger, e cada movimento segue gravando historico.
-- Aditivo e idempotente.
-- =====================================================================
insert into public.lead_status_transitions (from_status, to_status)
select f::public.lead_status, t::public.lead_status
from unnest(array[
        'rascunho_pronto','aprovado','enviado','sem_resposta',
        'respondeu','interessado','reuniao','proposta','fechado'
     ]) as f,
     unnest(array[
        'aprovado','enviado','respondeu','interessado','reuniao','fechado'
     ]) as t
where f <> t
on conflict (from_status, to_status) do nothing;
