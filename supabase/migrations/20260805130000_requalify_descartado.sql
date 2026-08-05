-- =====================================================================
-- Garimpo - descartado deixa de ser beco sem saida.
--
-- "descartado" nao tinha nenhuma transicao de saida, entao todo descarte era
-- definitivo. Isso torna qualquer melhoria de ICP invisivel pra base: quando a
-- calibragem muda (peso de criterio, corte da lente) ou quando o enriquecimento
-- traz dado novo (o CNPJ que faltava, e com ele a firmografia da Receita), o
-- lead continua descartado pra sempre — mesmo passando a merecer.
--
-- So a volta pra 'qualificado' entra. Nao se volta direto pra 'enviado' nem
-- pra qualquer estado adiante: o lead re-qualificado passa pela esteira de novo
-- (rascunho, revisao humana, envio), igual a qualquer outro.
--
-- IMPORTANTE: a tabela diz o que o BANCO permite. Quem descarta na mao continua
-- protegido no codigo: o comando `requalify` so reavalia lead cujo ultimo
-- descarte veio do ator 'system'. Descarte humano ("numero errado", "sem
-- interesse") e decisao, nao falta de dado, e o robo nao desfaz decisao sua.
-- =====================================================================

insert into public.lead_status_transitions (from_status, to_status)
values ('descartado', 'qualificado')
on conflict (from_status, to_status) do nothing;
