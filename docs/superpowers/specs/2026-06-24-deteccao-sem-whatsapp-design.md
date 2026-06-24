# Detecção de número sem WhatsApp (design)

**Data:** 2026-06-24
**Status:** aprovado pelo dono, pronto pra planejar.

## Problema

Leads chegam com número que não tem WhatsApp (fixo, número errado, sem conta). Hoje o usuário só descobre ao clicar pra abrir a conversa, e o número morto fica ocupando a fila. O dono quer matar isso na raiz, de forma profissional (dev, UI, UX).

## Restrição técnica que define a arquitetura

Checar "esse número tem WhatsApp?" só é possível onde existe uma sessão logada do WhatsApp. No stack atual, isso é **a extensão** (WhatsApp Web via wa-js). O servidor/esteira (Python) não tem sessão e não pode checar. As alternativas server-side (API oficial do WhatsApp Business, paga e com WABA; ou gateways de terceiros, pagos e contra os termos) estão fora porque o dono usa só recursos grátis. Logo, toda a detecção vive na extensão.

O sinal é `WPP.contact.queryExists(num)`, já chamado em `extension/src/content/wa-glue.mjs:52` (hoje o resultado é ignorado). Retorna um objeto com `wid` quando o número tem WhatsApp, e resolve vazio (null/undefined) quando não tem.

## Decisões do dono

1. **Destino do lead sem WhatsApp:** arquivar (`archived = true`) e marcar com a tag `sem-whatsapp`. Sem status novo (sem mexer no enum).
2. **Comportamento:** automático com desfazer (não pergunta a cada lead).
3. **Cadência:** validação proativa em background (throttled, anti-ban) mais uma rede de segurança no clique.

## Princípio anti-falso-positivo (crítico)

Só arquiva quando `queryExists` **resolve limpo informando que o número não existe**. Se a chamada lançar erro (sessão não pronta, rede, rate limit), trata como "não sei" e **não faz nada** com o lead. Nunca arquivar um lead por causa de erro transitório. Esse é o guard-rail que protege lead bom.

## Modelo de dados

- Tag `sem-whatsapp` no array `tags` do lead (campo já existe em `front/src/lib/types.ts`).
- Nova coluna `whatsapp_checked_at timestamptz null` na tabela `leads`. Migration **aditiva** (via `npm run db:push`), não toca no enum de status nem nas transições.
- Semântica:
  - `whatsapp_checked_at` nulo: ainda não validado.
  - `whatsapp_checked_at` setado e tag `sem-whatsapp` ausente: tem WhatsApp.
  - `whatsapp_checked_at` setado e tag `sem-whatsapp` presente: não tem WhatsApp (arquivado).
- RLS: o PATCH da extensão (`repo.updateLead`) já atualiza colunas do lead (ex: tags, archived). Confirmar que a policy de update permite `whatsapp_checked_at` (coluna nova entra na mesma policy de update por owner). Sem policy nova esperada, só verificar.

## Componentes

### 1. wa-glue (detecção)
`extension/src/content/wa-glue.mjs`. Expor uma função `checkWhatsapp(num)` que chama `queryExists` e devolve um veredito explícito:
- `{ status: "has" }` quando resolve com `wid`.
- `{ status: "none" }` quando resolve vazio (não existe).
- `{ status: "unknown" }` quando lança erro (não decide nada).
A função `resolveChatId` existente continua, mas passa a reusar esse veredito.

### 2. repo (gravação)
`extension/src/lib/repo.mjs`. Funções:
- `markNoWhatsapp(lead)`: `updateLead(id, { archived: true, tags: [...dedup(tags), "sem-whatsapp"], whatsapp_checked_at: nowIso })`.
- `markChecked(id)`: `updateLead(id, { whatsapp_checked_at: nowIso })` (caso positivo, só registra que checou).
- `undoNoWhatsapp(lead, prevTags, prevArchived)`: restaura tags e archived anteriores e zera `whatsapp_checked_at`.
Reusa o PATCH que já existe. Dedup da tag pra não duplicar.

### 3. Quota anti-ban
`extension/src/lib/wa-quota.mjs` (novo). Espelha o padrão da cota do Maps:
- Teto diário padrão 150 checagens (reseta na virada do dia, fuso local).
- Espaçamento mínimo entre checagens ~4s, com jitter.
- Persistência em `chrome.storage.local` com chave por data (`wa-check-YYYY-MM-DD` -> contador).
- API: `canCheck()` (bool), `recordCheck()`, `remaining()`.
- Configurável: o teto diário pode virar setting depois; começa com a constante 150.

### 4. Varredura proativa
Orquestrada pelo background/content quando a aba do WhatsApp está aberta.
- Seleciona alvos via `repo.listLeads`: status em (`rascunho_pronto`, `aprovado`), `archived` falso, `whatsapp_checked_at` nulo. Mais antigos primeiro.
- Loop respeitando a quota: enquanto `canCheck()` e houver alvo, checa 1, aplica `markNoWhatsapp` ou `markChecked`, `recordCheck()`, espera o intervalo com jitter.
- Para imediatamente se a sessão do WhatsApp não estiver pronta (veredito `unknown` repetido) ou a aba perder foco/fechar.
- Sem varrer tudo de uma vez; é um gotejamento.

### 5. Rede no clique
No fluxo de abrir conversa (`main.mjs` mais `wa-glue`): antes de abrir, usa `checkWhatsapp`. Se `none`: não abre, chama `markNoWhatsapp`, mostra o estado de UI abaixo. Se `unknown`: segue o fluxo normal de abrir (não pune). Se `has`: abre normal. A rede no clique não consome quota além do que já roda no open.

### 6. UI/UX no card da extensão
`extension/src/content/main.mjs`:
- Estado "sem WhatsApp": bloco claro com texto "Esse número não tem WhatsApp. Arquivei e marquei com a tag sem-whatsapp." mais dois botões: **Desfazer** (chama `undoNoWhatsapp`, volta o lead) e **Corrigir número** (abre edição do número; ao salvar, limpa a tag, desarquiva, zera `whatsapp_checked_at` e re-valida).
- Indicador discreto de varredura: linha pequena "validando números... X/Y" quando a varredura está rodando. Não bloqueia nada.
- Copy em português correto, sem travessão, sem cara de IA (regra do dono).

### 7. CRM (sem mudança de comportamento, só consequência)
- Fila (`front/src/app/(app)/fila/page.tsx`) já exclui `archived`. Confirmar que `celular` também exclui arquivado; se não, ajustar pra excluir.
- A tag `sem-whatsapp` já é filtrável em Contatos (filtro de tags existente).
- Opcional, fora do escopo mínimo: um filtro rápido "sem WhatsApp" em Contatos. Não fazer agora.

## Fluxos

**Proativo:** WhatsApp aberto -> varredura pega lead pendente -> `checkWhatsapp` -> `none`: arquiva+tag+checked; `has`: só checked; `unknown`: deixa pra próxima -> respeita quota -> mortos somem da fila antes do usuário ver.

**Clique:** usuário abre lead na extensão -> `checkWhatsapp` -> `none`: não abre, arquiva+tag, card mostra aviso com Desfazer e Corrigir número -> `has`: abre normal.

**Corrigir número:** usuário edita o número -> salva -> limpa tag, desarquiva, zera checked -> entra de novo na fila de validação.

## Edge cases

- Sessão do WhatsApp não pronta: `unknown`, não age. A varredura pausa.
- Número escrito errado (typo) mas a pessoa tem WhatsApp: o "Corrigir número" resolve, revalidando.
- Lead já arquivado manualmente: a varredura ignora (filtra `archived` falso).
- Tag duplicada: `markNoWhatsapp` deduplica.
- Web sem extensão: não detecta sozinho, mas a varredura proativa já tirou os mortos antes; o problema da fila web morre na raiz desde que a extensão rode em algum momento.
- Ban: mitigado pela quota diária, espaçamento, jitter, só com aba aberta, e parada na primeira incerteza de sessão.

## Fora de escopo

- Match em massa CRM x contatos do WhatsApp (o dono mandou esquecer).
- Distinção "conta pessoal vs comercial" (impossível via wa-js sem API Business paga).
- Status dedicado no enum (decidiu-se por tag).
- Validação server-side na esteira (impossível sem sessão/API paga).

## Verificação

- Front e extensão: sem runner de teste unitário no front. Gate = `npm run build` e `npm run lint` no `front/` passando para qualquer mudança no front; carregar a extensão no Chrome e validar manualmente os fluxos (clique com número morto, varredura com quota, desfazer, corrigir número).
- A lógica pura nova (quota, dedup de tag, veredito) deve ficar em funções isoláveis (`wa-quota.mjs`, helpers no `repo.mjs`) pra facilitar teste manual e revisão.
- Migration: aplicar com `npm run db:push` e confirmar a coluna `whatsapp_checked_at` na tabela `leads`.
