# Plano de execução, redesign 4YUmkt

> Front refeito a partir de `claude-design-ref/4YUmkt.dc.html` (layout alvo) e
> `claude-design-ref/uploads/garimpo-funcoes-da-plataforma.md` (funções). Este
> doc supera a parte de FRONT do `PLANEJAMENTO.md`; a parte de DADOS continua
> valendo. Regra: cada página entregue tem que estar **correta** (bate com o
> design e as funções), **funcional** (ligada ao repo mock + supabase, com as
> interações reais) e **funcionando** (lint, build e testes verdes, sem dado
> fake hardcoded).

## O que muda e o que não muda

- **Muda:** a apresentação inteira (design system, shell, 7 páginas, mobile),
  mais 4 dados/integrações novas (feed de atividade, cobertura por zona, deltas
  semanais, Google Calendar) e auth multi-tenant de verdade.
- **Não muda:** o miolo de dados. Schema, RPC `transition_lead`, padrão
  repo/sink, scoring, esteira, dedup, máquina de estados (15 estados) seguem.
  É o que torna o rebuild de UI barato.

## Decisões desta rodada (cravadas)

1. **2 serviços fica** (tráfego × automação × ambos). A automação entra no
   layout: badge no card, sinais e copy próprios, filtro e preferência.
2. **No celular = app responsivo/PWA**, não injeção no WhatsApp mobile. Serve
   pra revisar a fila e abrir a conversa via `wa.me`. A extensão segue desktop.
3. **Itens que o protótipo não mostrou voltam** com os padrões do design novo:
   LGPD opt-out, histórico do funil, undo/arquivar/reativar, estado
   `sem_resposta`, segunda mensagem (`draft_msg2`).
4. **Funil:** clicar no card abre a ficha; arrastar move o estágio. O drag
   respeita `transition_lead` (transição inválida recusa com aviso).
5. **Arrastar pra Reunião pede a data** e cria evento no **Google Calendar** do
   usuário (OAuth Google por usuário).
6. **Multi-tenant:** cada usuário tem seus leads (RLS `owner_id = auth.uid()` já
   isola). O front usa sempre a sessão logada, zero owner hardcoded.

## Constraints globais (herdadas + novas)

- Offline-first: toda página roda no mock e liga no supabase por env.
- Status só via RPC `transition_lead`. Espelhar máquina nos 3 lugares.
- Zero travessões, zero cara de IA (ver `GUIA-COPY-HUMANA.md`).
- Design system do `claude-design-ref` é a fonte da verdade visual (tokens,
  fontes Plus Jakarta + Space Grotesk, ícones Phosphor, tema claro default).
- Commits pt-BR + trailer; push por etapa; segredo só em `.env`.
- TDD por camada (pytest, node --test, npm lint/build, db:validate).

---

## Trilhas

```
A. Fundação (faz 1x, destrava tudo)
   A1 design system + shell + rotas   A2 auth multi-tenant + onboarding

B. Dados/backend (paralelo, agnóstico de UI)
   B1 service_target (2 serviços)   B2 perfil+dedup+raio   B3 scan_coverage
   B4 feed de atividade   B5 Gemini real   B6 Google Calendar   B7 captação Maps

C. Páginas (cada uma correta + funcional + funcionando)
   C1 Início   C2 Fila   C3 Ficha   C4 Buscar   C5 Funil
   C6 Resultados   C7 Mobile/responsivo   C8 Configuração
```

Dependências resumidas: as páginas C dependem dos dados B; tudo depende da
fundação A. Tabela no fim.

---

## A. Fundação

### A1, design system + shell + rotas
**Entrega:** o casco visual novo, uma vez.
- Tokens: portar as CSS vars do ref (`--bg, --surface, --ink, --brand, --grad,
  --success...`) pro Tailwind 4 (`@theme` em globals.css), com tema claro
  default + dark. Mapear pros componentes shadcn/Base UI existentes.
- Fontes: `next/font` com Plus Jakarta Sans (corpo) + Space Grotesk (títulos/
  números). Trocar Geist.
- Ícones: `@phosphor-icons/react`. Trocar lucide nos componentes.
- Shell: sidebar 250px (logo 4YU, nav 7 destinos com ícone + badge da fila,
  toggle de tema, bloco do usuário) + header (título + subtítulo por rota +
  pill "X leads prontos pra você"). Layout responsivo (sidebar vira nav inferior
  ou drawer no mobile).
- Rotas Next: `/` (Início), `/fila`, `/ficha/[id]`, `/buscar`, `/funil`,
  `/resultados`, `/celular`, `/config`. Migrar o conteúdo atual pra esse mapa.
**Funcional:** navegação real entre as 7 rotas, tema persistente, badge da fila
lendo o repo.
**DoD:** lint+build limpos; shell renderiza em desktop e mobile; nav e tema
funcionam ligados ao mock.

### A2, auth multi-tenant + onboarding
**Entrega:** login/signup por usuário; cada um vê só os seus.
- Supabase Auth: e-mail/senha + Google (o Google já serve de base pro Calendar
  em B6). Tela de login/signup no design novo.
- Garantir que o front usa sempre `auth.uid()` (remover qualquer owner fixo do
  caminho do front; o mock usa um DEMO_OWNER só offline).
- Onboarding: se o usuário não tem `search_profile` (B2), cair na Configuração
  simplificada antes de tudo ("escolhe ramos, confirma cidade, pronto").
**DoD:** dois usuários de teste enxergam bases separadas (RLS); signup cria
sessão; sem perfil leva ao onboarding.

> Multi-tenant na esteira (autopilot por usuário, varrendo o perfil de cada um)
> é item sinalizado: o front já é multi-user; a esteira rodar para N usuários
> entra junto de B2/B7. Sinalizar, não esconder.

---

## B. Dados/backend

### B1, service_target (2 serviços)  [era F1]
Schema enum `service_target ('trafego','automacao','ambos','indefinido')` +
coluna. `scoring.py` quebrado em `score_trafego` e `score_automacao`, decide o
alvo, `score_reason` com os dois ICPs. `draft/` escreve copy por serviço
(segue `GUIA-COPY-HUMANA.md`). Seed e tipos com `service_target`.
**DoD:** pytest (4 casos), db:validate, tipos no front.

### B2, perfil + dedup nome+endereço + raio  [era F2, + raio]
Tabela `search_profile` (owner_id, `niches text[]`, `city`, `state`,
`radius` enum/text, `default_service_target`, `autopilot boolean`, timestamps).
Coluna gerada `name_addr_normalized` + índice único parcial (4ª chave de dedup).
`normalize.py`/jsonfile ganham o fallback nome+endereço.
**DoD:** db:validate cobre tabela + 4ª chave; pytest do dedup; perfil no mock.

### B3, scan_coverage (cobertura por zona)  [era F3 dado]
Tabela `scan_coverage` (owner_id, region_key/nome, bbox ou centro, niche,
`pct int`, covered_at, result_count). Orquestração lê/grava (grid puro). Dá a
cobertura por zona pro mapa da Buscar e o "varrendo agora".
**DoD:** pytest da orquestração (não revisita coberto); db:validate.

### B4, feed de atividade
Tabela `activity_log` (owner_id, tipo enum [busca, enriquecimento, descarte,
rascunho, varredura], `text`, `ref_count`, created_at). A esteira grava um
evento por etapa relevante. O front lê os últimos N pro Início.
**DoD:** db:validate; esteira grava eventos; feed lê do repo no mock.

### B5, Gemini real  [era F5]
Liga `GARIMPO_LLM=gemini`, testa chamada real, copy por serviço (B1) seguindo o
guia. Fallback pro mock se a API falhar.
**DoD:** chamada real devolve msg1/msg2 coerentes por serviço, sem AI-tell.

### B6, Google Calendar por usuário
Multi-usuário de boa: cada um conecta a própria conta Google, o token fica por
`owner_id`, e os eventos vão pra agenda dele. Dois caminhos, os dois funcionam
com vários usuários:
- **Entrar com Google** (recomendado): o login já pede o consentimento do
  Calendar, então linka a agenda no mesmo passo. Sem etapa extra.
- **E-mail/senha + conectar depois:** quem entrou por e-mail/senha clica
  "Conectar Google Calendar" na Configuração e faz o OAuth só pro calendar.
Escopo `calendar.events`. Ao mover um lead pra Reunião com data/hora, cria o
evento na agenda daquele usuário.
**DoD:** dois usuários conectam agendas diferentes (isolado); mover pra Reunião
com data cria evento real na agenda certa; sem agenda conectada, pede a data e
só registra o status (degrada com graça).

### B7, captação real do Maps (extensão)  [era F4]
`repo.mjs` ganha `insertLead`; content script no `google.com/maps/*`; raspagem
resiliente; carimba `service_target`, cidade, categoria; dedup pelos índices.
**DoD:** node --test; bundle regenerado; raspagem manual numa busca real.

### B8, precificação + sugestão de valor (opcional, mas bom de ter)
Nada disso é obrigatório pro lead avançar; são campos a mais que ajudam a fechar.
- **Anotações:** campo `notes` (texto livre) no lead, pra ir registrando
  condições de investimento, observações da conversa, etc. (pode virar tabela de
  notas com data depois; MVP é um campo).
- **Valor sugerido pela IA:** colunas `suggested_value` + `suggested_value_reason`.
  Quando o lead chega na **Reunião** (ou por um botão "sugerir valor"), a IA
  recomenda um valor a partir de localização, porte do negócio (nº de avaliações
  como proxy), serviço (tráfego x automação) e das `notes`. Sempre sugestão, com
  o motivo escrito; o Rafa decide. Provider `suggest_value(lead)` com mock
  (heurística offline) e Gemini (estimativa real), seguindo o padrão do `draft/`.
- **Valor fechado:** ao **Fechar**, registra `deal_value`, `deal_billing`
  (`mensal_fixo` | `por_prazo`) e `deal_term_months` (quando for por prazo),
  mais `deal_closed_at`. Some isso na Meta/Resultados depois (receita real).
Schema: migration com `notes`, `suggested_value`, `suggested_value_reason`,
`deal_value`, `deal_billing` (enum), `deal_term_months`, `deal_closed_at`.
**DoD:** db:validate cobre os campos; pytest da heurística de sugestão; UI de
valor na Ficha e no Fechou (C3/C5) gravando de verdade.

---

## C. Páginas (cada uma ligada ao dado, não estática)

> Padrão por página: construir o visual do ref com os tokens de A1, ligar no
> `getRepo()` (mock + supabase), implementar as interações de verdade, cobrir
> com teste onde houver lógica. "Pronto" = funciona ligado ao dado, não é mock
> de pixel.

### C1, Início
Hero ação-first ("Boa tarde, Rafa / Já tem N leads bons te esperando", botões
Revisar a fila / Buscar mais), feed "O que rolou enquanto você não tava" (lê
`activity_log` B4 + linha viva "varrendo X agora"), Meta do mês, stats da semana
("nunca repetiu ninguém: garantido" sai da dedup).
**Dado:** queue count, activity_log (B4), meta, KPIs da semana.
**DoD:** saudação por horário; contagem real da fila; feed real; botões navegam.

### C2, Fila de leads  (núcleo do dia)
Revisão 1 a 1 (progresso "X de N"), atalhos A/D, card com badge de **serviço**
(B1), "Por que esse é um bom alvo" (motivo PT), grade de dados, "Sinais que eu
li", "Ver ficha completa". Painel direito "Mensagem pronta" com **msg1 e msg2**
editáveis. Descartar (com undo via toast) / Aprovar e preparar envio → modal de
envio (abrir `wa.me` ou "já mandei, marcar enviado"). Empty state "Fila zerada".
**Dado:** leads em `rascunho_pronto`, drafts, service_target; transições via RPC.
**DoD:** teclado funciona; aprovar/descartar mexem o status de verdade; undo
reverte; edição salva no draft; modal abre o WhatsApp certo.

### C3, Ficha completa
Página read-first: dados com **fonte por campo** (proveniência), leitura dos
sinais, abordagem escrita. **Volta o que o layout esqueceu:** edição dos campos,
**histórico do funil** (timeline com data), **LGPD opt-out** (toggle), **ações**
(arquivar/desarquivar, excluir com confirmação, reativar se descartado). Score
em PT (sem número cru), com o detalhe dos dois ICPs (B1).
Mostra também (B8): campo de **anotações** editável, o **valor sugerido** pela
IA com o motivo (quando houver), e, se já fechou, o **valor fechado** + tipo de
cobrança (mensal fixo ou por prazo).
**Dado:** lead + provenance + history; setOptOut/setArchived/remove/transition;
notes, suggested_value, deal_* (B8).
**DoD:** editar salva; opt-out bloqueia contato; histórico real; ações funcionam;
anotações e valores gravam.

### C4, Buscar
Form (Ramo, Cidade, Bairro/zona, Quantos, **serviço-alvo**) + Buscar agora com
confirmação em PT ("achei X, descartei repetidos, N novos entraram, ignorando
os que você já tem"). Direita: "Cobertura por região" com mapa Leaflet (tiles
Esri) + barras de % por zona, lendo `scan_coverage` (B3).
**Dado:** dispara busca (gatilho sob-comando), scan_coverage por zona.
**DoD:** form dispara busca real (ou enfileira); mapa e % vêm do dado, não fixos.

### C5, Funil
Kanban com as colunas user-facing (mapa abaixo). **Clicar no card abre a ficha**
(C3); **arrastar move o estágio** via `transition_lead` (transição inválida
recusa com aviso). **Arrastar pra Reunião abre um pedido de data/hora** e cria o
evento no Google Calendar (B6). Estados internos (bruto/enriquecido/qualificado)
ficam invisíveis; saídas (descartado/sem interesse/perdido) num filtro "saíram".
Ao cair em **Reunião**, além da data (Calendar), a IA sugere um valor (B8) que
aparece na ficha. Ao cair em **Fechou**, abre um mini-form pra registrar o valor
fechado + tipo (mensal fixo ou por prazo X meses).
**Dado:** leads por estágio, transição via RPC, calendar (B6), valores (B8).
**DoD:** click abre ficha; drag válido move e persiste; drag inválido recusa;
Reunião pede data e cria evento; Fechou registra o valor.

### C6, Resultados
4 KPIs com **deltas vs semana passada** (precisa de comparação histórica), barras
"Do encontrado ao fechado" (inclui "Passaram no filtro" = qualificados), Meta do
mês. Reaproveita `funnel.ts`/`kpis`.
**Dado:** funnel atual + série semanal (de `lead_status_history` ou snapshot).
**DoD:** números batem com a base; deltas calculados, não fixos.

### C7, Mobile / responsivo  (o "No celular" de verdade)
Versão responsiva do app pra **revisar a fila** e **enviar**: a fila e a ficha
funcionam no celular; enviar abre `wa.me` (mensagem pronta no clipboard);
marcar evolução acontece no próprio app (não dentro do WhatsApp). Opcional PWA
(manifest + instalar). A tela 1 do protótipo (botões dentro do WhatsApp) não é
factível no mobile; vira isto.
**DoD:** fila e envio usáveis num viewport de celular; `wa.me` abre a conversa
certa; marcar status funciona no app.

### C8, Configuração
Ramos (chips multi-select), Cidade base + **Raio de atuação**, **serviço padrão**
(B1), **Busca no piloto automático** (toggle, B2), **conectar Google Calendar**
(B6), Salvar e deixar rodando. É também o onboarding (A2).
**Dado:** search_profile (B2), status da conexão Calendar (B6).
**DoD:** salvar persiste o perfil; autopilot liga/desliga real; conectar agenda
funciona; primeira vez serve de onboarding.

---

## Mapeamento do funil (definido)

Colunas do funil:

| Coluna | Estado(s) no banco |
|---|---|
| Novo | rascunho_pronto, aprovado |
| Enviado | enviado, sem_resposta |
| Respondeu | respondeu |
| Interessado | interessado |
| Reunião | reuniao, proposta |
| Fechou | fechado |
| Arquivados | archived = true (e descartado / sem_interesse / perdido) |

Leads em bruto / enriquecido / qualificado não aparecem no funil (a esteira
ainda está trabalhando neles); entram em "Novo" quando viram rascunho_pronto.

Regra do drag: soltar numa coluna ativa chama `transition_lead` pro status
representativo da coluna (transição inválida recusa com aviso). Soltar em
Arquivados arquiva (setArchived true); tirar de Arquivados desarquiva/reativa.

---

## Ordem de execução

1. **A1 shell + A2 auth** (fundação, primeiro).
2. Paralelo: **B1 (2 serviços)**, **B2 (perfil+dedup+raio)**, **B4 (feed)**.
3. **C8 Config** (onboarding) → **C2 Fila** + **C1 Início** → **C3 Ficha**.
4. **B3 scan_coverage** → **C4 Buscar**.
5. **B6 Google Calendar** → **C5 Funil**.
6. **C6 Resultados** → **C7 Mobile**.
7. **B5 Gemini**, **B7 captação Maps**.

Cada item vira um plano TDD bite-sized na hora de executar (formato
`superpowers:writing-plans`), pro Opus revisar e o Codex implementar.

## Decisões fechadas (desta rodada)

- **Funil:** 7 colunas (Novo, Enviado, Respondeu, Interessado, Reunião, Fechou,
  Arquivados). Click abre ficha, drag move. Mapa acima.
- **Google Calendar:** login com Google (recomendado) linka a agenda no mesmo
  passo; e-mail/senha conecta depois. Multi-usuário, token por owner. (B6)
- **Esteira multi-tenant (boa prática adotada):** o autopilot roda por usuário,
  varrendo o perfil de cada um (B2), gravando com o `owner_id` de cada. A esteira
  itera os usuários com perfil + autopilot ligado, em vez de um owner fixo. Entra
  com B2/B7. É o certo pra um produto multi-usuário.
- **Deltas semanais (C6):** é o "+14 vs semana passada" dos KPIs. Sai do
  histórico de status (conta eventos da semana atual vs a anterior), sem tabela
  nova. Simples e suficiente.
- **Precificação (B8):** campos de valor + sugestão da IA na Reunião + registro
  do valor no Fechou. Opcional, não trava o fluxo.
