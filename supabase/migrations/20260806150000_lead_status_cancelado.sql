-- =====================================================================
-- Garimpo · novo estado: cliente cancelou (churn)
--
-- 'fechado' era o fim da linha feliz, e nao havia como dizer que o cliente
-- saiu. Efeito pratico: o MRR da tela de Clientes so subia. Somava todo
-- contrato mensal ja fechado, pra sempre, e quem cancelou continuava contando
-- como receita. Um numero que so cresce nao serve pra decidir nada.
--
-- Este arquivo SO adiciona o valor ao enum. As transicoes e as colunas vao no
-- proximo, porque o Postgres recusa usar um valor de enum na mesma transacao em
-- que ele foi criado ("unsafe use of new value"). E o motivo de existirem dois
-- arquivos aqui em vez de um.
-- =====================================================================

alter type public.lead_status add value if not exists 'cancelado';
