# Pendências do CRM — lote de feedback (2026-06-22)

Handoff do lote de pedidos que vieram do WhatsApp (dono Eduardo + Gabriel).
Status: **feito** / **adiado (com motivo)** / **falta**.

## Feito nesta sessão (no ar após o deploy)

| # | Pedido | O que foi feito |
|---|---|---|
| 8 | "Reuniões" sem o til na tabela | corrigido para "Reuniões" |
| 9 | "Do encontrado ao fechado" | virou "Da prospecção ao fechamento" |
| 11 | "Em conversa" | virou "Em contato" (resultados + stats-bar) |
| 3 | Filtrar 2-3 ramos na busca (não todos) | multi-seleção de nicho com chips removíveis; dispara a busca por ramo em paralelo. Novo `multi-ramo-dropdown.tsx` |
| 16 | Escolher a cidade direto (tipo Uber), sem estado antes | autocomplete de cidade (digita o nome, aparece "Cidade - UF", preenche os dois). IBGE nacional. Aplicado na busca E no onboarding. Novo `city-autocomplete.tsx` |
| 4/12 | Raio de atuação visual + mapa reagir ao estado/cidade | mapa dá flyTo/zoom ao trocar estado e cidade, mostra label "Cidade - UF" e desenha o **círculo do raio** (10/25km) centrado na cidade. `coverage-map.tsx` |
| 5 | Mudar ramo no perfil atualiza o serviço | confirmado que já sincroniza (`chooseProfession` seta `defaultService`); sem inconsistência |
| 6 | Picker de horário parece estático | modal de reunião ganhou sugestões rápidas (Amanhã 10h, Em 2h/24h/48h) + confirmação visual do horário escolhido |
| 18 | Marcar valor real fechado (IA sugeriu X, fechei Y) | ao mover pra "Fechou" (kanban ou ficha), abre modal pré-preenchido com o `suggested_value` da IA ("IA sugeriu R$X"); salva `deal_value` + `deal_closed_at`; mostra o valor no card e na ficha |
| 13 | Receita / contratos fechados | barra de resumo no topo do funil "R$X · N contratos fechados"; alimenta o KPI "Receita fechada" que já existia em Resultados |
| 17 | Follow-up: dia (1/3/5/7/10) + mensagem + lembrete | migration nova (`followup_at`, `followup_note`, **já aplicada no prod**); bloco "Follow-up" na ficha pra lead enviado/sem_resposta (botões +1/3/5/7/10 dias + mensagem); badges "Follow-up hoje" / "Follow-up atrasado" no kanban |

## Adiado (com motivo de produto)

| # | Pedido | Por que adiei |
|---|---|---|
| 7 | Transcrição + resumo de reunião | Precisa captura de áudio + serviço de STT pago (Whisper/AssemblyAI). É add-on de plano pago, não core. Vale fazer como feature paga depois. |
| 14 | Anexar arquivos nas anotações (ex: contrato) | Precisa Supabase Storage (bucket + RLS + policies + upload). Útil, mas é etapa própria, não dá pra embutir às pressas sem segurança de acesso. |
| 15 | Aba de trocar de plano / billing | Precisa Stripe (cobrança). Gestão de usuários **já existe** (página Admin). Billing entra junto com o salto pra SaaS (Fase 2). |
| 1 | Idioma do sistema (i18n) | Prematuro: só BR hoje. Quando virar produto pra fora, aí sim. |

## Falta fazer (próximo passo, não terminei)

1. **Re-draft em lotes com o tom novo** (você pediu: "a IA faz em lotes, não você").
   - Leads em `qualificado` **já vão re-rascunhar sozinhos** no próximo cron, com o tom novo (o prompt foi atualizado).
   - Os que JÁ estão rascunhados (rascunho_pronto+) precisam de um comando `redraft` na esteira (re-gera a copy via LLM, em lotes, sem mexer no status) + disparar via GitHub Actions `workflow_dispatch` (a LLM key do cron está nos secrets do GH, não no .env local, por isso quem roda é o cron, não eu).
   - **Estava montando isso quando você saiu.** O workflow `esteira.yml` já tem `workflow_dispatch`; falta adicionar o comando `redraft` e a opção no dispatch.

2. **Branding "4YUmkt" → "4YU CRM"** (#2) — é decisão tua de marca, não chuto. Me confirma e eu troco as referências no app.

3. **Verificação visual no browser** — validei `npm run build` + `npm run lint` (verdes) e `db:validate`, mas não abri o app rodando pra ver as telas novas (busca/mapa/follow-up) na prática. Recomendo um olhar rápido quando voltar.

## Notas técnicas

- Migration `20260622120006_followup.sql` aplicada no prod via `npm run db:push` (colunas nullable, aditivas).
- Front: build e lint verdes. Stack é Next.js modificado (ver `front/AGENTS.md`).
- Limpeza de leads gringos: 172 removidos antes, trava BR no lugar (ver commit `8873b3a`).
