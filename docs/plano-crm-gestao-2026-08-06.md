# Plano: de máquina de prospecção para CRM de gestão

> **ESTADO: fatias 1, 2 e 3 FEITAS e no ar.** Falta a 4 e a 5. O que foi
> entregue, o que mudou de ideia no caminho e como continuar estão em
> [`HANDOFF-CRM-GESTAO.md`](HANDOFF-CRM-GESTAO.md). Leia aquele primeiro: este
> aqui é o plano como ele foi pensado, e em alguns pontos a execução discordou
> dele de propósito (aniversário anual em vez de mensal, `notes` que não migrou,
> aba que abre onde há o que fazer).
>
> Criado em 2026-08-06. Base: análise de produto sobre o que falta pro CRM servir
> a quem quer **gerir carteira**, não só prospectar. Cada afirmação aqui foi
> verificada contra o código, com arquivo e linha.

## Diagnóstico em uma frase

O produto hoje é uma máquina de prospecção com um funil colado no fim. Gestão de
carteira exige que a unidade de valor mude de "lead" pra "conta ao longo do
tempo". O schema não tem tempo, só `updated_at`.

---

## Achados verificados (a base do plano)

| # | Achado | Prova | Consequência |
|---|---|---|---|
| 1 | O trigger da máquina de estados é `before update`, não insert | `20260619120005_functions_triggers.sql:70` | Dá pra INSERIR lead já em `fechado`. Cadastrar cliente à mão não precisa de 5 transições |
| 2 | `create()` cai no default `bruto` e a esteira busca `bruto` | `front/src/lib/repo/supabase.ts:63` + `esteira/.../pipeline_stream.py:75` | Cliente cadastrado à mão vira alvo do robô e pode ser **descartado** |
| 3 | `LeadEditable` já tem todos os `deal_*` | `front/src/lib/types.ts:288` | Editar negócio é UI pura, zero schema |
| 4 | A ficha já tem um render de timeline pronto | `front/src/app/(app)/ficha/[id]/page.tsx:1345` | Atividades reusam o padrão, não inventam |
| 5 | Máquina de estados espelhada em 4 lugares | tabela `lead_status_transitions`, `state-machine.ts`, `state_machine.py`, `extension/src/lib/state-machine.mjs` | Status novo custa 5 edits |
| 6 | `useLeads()` carrega a base inteira em memória | `front/src/lib/repo/supabase.ts:16` | Dado por lead em tela de lista precisa de coluna desnormalizada, não join |
| 7 | `renewalDate()` retorna null pra `mensal_fixo` | `front/src/lib/clients.ts:14` | Cliente recorrente nunca gera alerta. Metade da carteira é cega |
| 8 | MRR soma todo `mensal_fixo` fechado desde sempre | `front/src/app/(app)/clientes/page.tsx:53` | Sem churn o número só sobe. Métrica que mente |
| 9 | `parseFloat(v.replace(",", "."))` no modal de negócio | `front/src/app/(app)/funil/page.tsx:321` | `"2.500,00"` vira **2.5**. Corrupção silenciosa do valor fechado |

---

## O que falta pra ser CRM de gestão

1. **Modelo flat.** Uma linha `leads` = 1 empresa = 1 pessoa = 1 negócio. Carteira
   real tem N contatos por conta e N contratos por cliente.
2. **Histórico de interação não existe.** Só `lead_status_history` (mudou de
   status) e `notes` (um textarea que sobrescreve). Quem assume a carteira não
   sabe nada.
3. **Tarefas.** Só `followup_at` (uma por lead) e `cadence_step`.
4. **Pós-venda.** Sem churn, sem escopo do contrato, sem saúde da conta.
5. **Financeiro.** Contratado não é faturado nem recebido.
6. **Proposta é decorativa.** Status existe, não faz nada.
7. **Equipe.** `assigned_to` inerte, RLS por `owner_id`.
8. **Conversa não volta.** A extensão marca status, não guarda o que foi dito.

---

## Fatias

### FATIA 1 · Cadastrar e corrigir (~2,5 dias)

**1.2 Editar negócio na ficha · S · sem schema**
O bloco de negócio ([ficha:1080]) hoje é read-only e só aparece se
`deal_value != null`. Passa a aparecer sempre que o status for `fechado`, com
estado vazio convidativo (mesmo padrão pontilhado do bloco de notas, ficha:1331),
e vira editável inline reusando o padrão do `FollowupCard`.

Junto: `parseBRL` compartilhado em `lib/format.ts` corrige o achado #9 aqui e no
modal do funil.

**1.1 Novo contato manual · M · 1 coluna**
Um formulário, duas intenções: "lead pra prospectar" ou "cliente que já tenho".
Cliente entra direto em `fechado` (achado #1). Lead entra em `bruto` e passa pela
esteira.

Risco do achado #2: lead manual pode ser descartado pelo robô. Solução escolhida:
coluna `leads.manual boolean`, e o score da esteira nunca descarta manual. A
alternativa (entrar em `qualificado` e pular a esteira) foi rejeitada porque joga
fora o enriquecimento, que é o diferencial do produto.

**1.3 Churn · M · enum + 2 colunas**
Novo status `cancelado`. Registrar saída na ficha e em Clientes, nunca no funil
(cliente cancelado não é lead perdido, misturar polui a taxa de fechamento).
Custa os 5 espelhos do achado #5.

Alternativa descartada: reusar `archived` + `loss_reason`. `archived` já significa
"some da lista"; sobrecarregar destrói as duas semânticas.

### FATIA 2 · Timeline de atividade (~3 dias)

Tabela `lead_activities` (kind, body, happened_at). A ficha funde histórico de
status, atividade, anexo e follow-up numa linha do tempo só. `notes` migra como
atividade tipo `nota` e sai da ficha depois.

Coluna desnormalizada `leads.last_activity_at` por trigger, por causa do achado
#6: `Contatos` precisa de "último toque" por lead sem N queries.

`kind` é `text` com CHECK, não enum, pra não pagar o achado #5 de novo.

### FATIA 3 · Clientes vira carteira (~2 dias)

Abas Ativos / Atenção / Encerrados, com "Atenção" no topo definindo a tela.
Gatilhos: renovação em ate 30d, sem toque há 30d+, vencido. "Reativar frios" sai
de Clientes (é prospecção, não carteira).

Corrige o achado #7: `mensal_fixo` passa a alertar no aniversário mensal.

### FATIA 4 · Contas, contatos e negócios (~1 semana, alto risco)

Aditivo, nunca destrutivo: `lead_contacts` e `deals` com backfill dos campos
atuais e fallback nas telas. Não renomear `leads` pra `accounts` (ganho zero,
risco alto).

Não abrir antes das fatias 1 a 3 rodarem em produção com uso real.

### FATIA 5 · Financeiro leve (~2 dias)

`paid_until` + botão "Recebi". Resultados mostra recebido ao lado de contratado.
Não fazer: parcelas, boleto, NF, banco.

---

## Ordem de execução

`1.2` → `1.1` → `2` → `1.3` → `3`.

A 1.2 é meio dia e prova o padrão de edição. A 1.3 vem depois da 2 porque churn
sem timeline é métrica sem explicação.

Corte defendido: fatias 1 + 2 + 3, cerca de 7 a 8 dias, já entregam um CRM de
gestão honesto. A 4 é a única que dá pra adiar sem prejuízo hoje.
