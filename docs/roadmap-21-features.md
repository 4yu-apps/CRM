# Roadmap — 21 features do 4YU CRM (pós-varredura de usuário)

> Criado em 2026-06-24. Fonte: varredura de produto na ótica de usuário (gestor de tráfego) e dono.
> As melhorias de UX (Fases 0–4) já estão concluídas e em produção — ver `docs/superpowers/plans/2026-06-23-ux-melhorias.md` (local). Este documento é o roadmap das NOVAS funcionalidades.

---

## Contexto pra uma sessão nova (ler primeiro)

**App:** `front/` — Next.js (App Router). Deploy de produção pela Vercel CLI de dentro de `front/` (`vercel deploy --prod`); o projeto **não é git-connected**, então `git push` não publica. Tokens no `.env` raiz (`GITHUB_TOKEN`, `VERCEL_ACESS_TOKEN`). Ver memória `deploy-method`.

**Backend:** Supabase (Postgres + RLS por `owner_id` + Auth). Migrations em `supabase/migrations/`. A "esteira" de descoberta é **Python**, roda em **GitHub Actions cron a cada 2h** (`esteira/`), faz busca (Google Places) + enriquecimento + copy por IA (Gemini→Groq→mock).

**Camada de dados no front:**
- `front/src/lib/repo/` — interface `LeadsRepo` + impl `supabase.ts` e mock. `getRepo()` resolve qual usar. `useLeads()` (`src/hooks/use-leads.ts`) carrega TODOS os leads do dono (agora paginado, sem teto de 1000) e expõe `{leads, loading, error, refresh}`.
- `front/src/lib/state-machine.ts` — `TRANSITIONS`, `STATUS_META`, `TONE_CLASSES`, `nextStatuses`, `canTransition`, `EXIT_STATUSES`. Os status: `bruto, enriquecido, qualificado, rascunho_pronto, aprovado, enviado, sem_resposta, respondeu, interessado, reuniao, proposta, fechado, descartado, sem_interesse, perdido`.
- `front/src/lib/funnel.ts` — `funnel()`, `kpis()`, `depth()`. **JÁ calcula `taxaResposta` e `taxaFechamento`** (hoje não exibidas na tela).
- `front/src/lib/types.ts` — tipo `Lead`. Campos relevantes que JÁ EXISTEM: `status`, `score`, `score_reason`, `deal_value`, `deal_billing` (`mensal_fixo`|`por_prazo`), `deal_term_months`, `deal_closed_at`, `followup_at`, `opt_out`, `city`, `state`, `neighborhood`, `category`, `service_target`, `rating`, `reviews_count`, `match_rate`, `ads_active`, sinais de site/PageSpeed, `draft_msg1`/`draft_msg2`, `instagram`, `website`, `phone`, `whatsapp`, `email`, `updated_at`, `created_at`. Perfil: `SearchProfile` (`search_profiles`) + nome do usuário em `user_metadata.full_name` (Auth).
- Tabelas auxiliares: `lead_status_history` (trilha de status), `lead_field_provenance` (origem de cada campo), `scan_coverage` (cobertura de varredura por região/nicho).

**Telas (`front/src/app/(app)/`):** `page.tsx` (Início "o que fazer agora"), `fila`, `funil`, `contatos`, `ficha/[id]`, `resultados`, `buscar`, `agenda`, `celular`, `config`, `admin`. Componentes em `front/src/components/`.

**Regras de produto inegociáveis:**
- **"Nada sai sozinho"** — o CRM NUNCA dispara mensagem. O usuário envia do próprio WhatsApp. Toda automação é *sugestão/lembrete*, nunca envio automático.
- **pt-BR**, tom humano (`GUIA-COPY-HUMANA.md`), **sem travessão**, acentuação correta.
- LGPD: `opt_out` bloqueia contato; respeitar.

**Convenção de execução:** branch por fase (`feat/feat-faseN`), commit atômico por item, `cd front && npm run build` verde antes de cada commit, merge na `main`, push, deploy. Itens com schema novo: criar migration em `supabase/migrations/` (aplicar via Supabase Management API / `.env`).

**Esforço:** S = ~½ dia · M = ~1–2 dias · L = ~3+ dias / cross-stack.

---

## Ordem das fases (e o porquê)

1. **Métricas que provam ROI** — barato (reusa dado já calculado), prova valor rápido, zero schema.
2. **Cadência & não-esquecer** — o maior ralo operacional (núcleo do loop). Schema leve.
3. **Ação rápida no card** — UX que acelera o dia, baixo risco.
4. **Descoberta esperta** — melhora a entrada do funil; reusa `scan_coverage`/sinais.
5. **Notificações (infra)** — amplifica fases 2/3/6; é a mais "infra", então vem depois do valor in-app já existir.
6. **Retenção / pós-venda** — reusa `deal_*`; depende de notificações pra alertas.
7. **Templates & controle do robô** — toca a esteira (cross-stack).
8. **Equipe / multiusuário** — arquitetural (RLS, atribuição, papéis). Alinha com a fase SaaS (memória `project-vision-saas-roadmap`). Por último.

---

## FASE 1 — Métricas que provam ROI (reusa dado, zero/baixo schema)

**Meta:** o dono enxerga conversão, segmentação e receita recorrente sem nenhuma coleta nova. Tudo em `resultados/page.tsx` + `funnel.ts`.

### #11 — Taxa de conversão por etapa visível · S · sem schema
- **O quê/por quê:** mostrar % de passagem entre etapas do funil (onde perco lead). `funnel.ts` JÁ calcula `taxaResposta`/`taxaFechamento` e o `depth()`; só não são exibidos.
- **Como:** em `resultados/page.tsx`, nas barras "Da prospecção ao fechamento", adicionar o % de conversão de cada etapa pra próxima (ex.: enviados→respostas X%). Expor as taxas que `funnel.ts` já retorna; se faltar alguma, somar no `funnel.ts`.
- **Decisão:** mostrar conversão etapa-a-etapa (relativa) ou acumulada (sobre o topo)? Recomendo etapa-a-etapa pra achar gargalo.

### #12 — Recorte por nicho / cidade / serviço · M · sem schema
- **O quê:** "barbearias convertem 2x", "vale buscar em tal cidade?". Campos `category`/`niches`, `city`, `service_target` já existem.
- **Como:** em `resultados`, um seletor de dimensão (nicho/cidade/serviço) que reagrupa os KPIs/funil por valor. Tudo client-side sobre `leads` (já carregados).
- **Decisão:** quais dimensões priorizar; quantos grupos mostrar (top N).

### #13 — Comparação mês-a-mês + seletor de período · M · sem schema
- **O quê:** comparar Maio vs Junho, ver tendência, escolher intervalo livre.
- **Como:** seletor de período em `resultados`; recomputar KPIs/funil/meta filtrando por `updated_at`/`deal_closed_at` no intervalo. Hoje as datas são fixas no código (`buildKpis`/`buildMeta`).
- **Nota:** `updated_at` é proxy imperfeito de "quando entrou no estágio"; pra histórico fiel, considerar usar `lead_status_history` (já existe). Decisão de precisão vs esforço.

### #14 — Ticket médio + MRR / receita recorrente · S–M · sem schema
- **O quê:** ticket médio, MRR contratado, receita projetada. Campos `deal_value`, `deal_billing`, `deal_term_months` já existem.
- **Como:** em `resultados`, derivar: ticket médio = média de `deal_value` dos fechados; MRR = soma dos `mensal_fixo`; projeção = `por_prazo` × meses. Card novo ou expandir a "Meta do mês".

### #17 — Motivo de perda · S · schema leve
- **O quê:** ao mover pra `perdido`/`sem_interesse`/`descartado`, registrar o porquê (preço, sem orçamento, concorrente, sumiu). Espelha o modal de "negócio fechado" que já existe no funil.
- **Como:** modal de motivo na transição pra estados de perda (em `funil/page.tsx` e onde houver a transição). Persistir.
- **Schema:** coluna `loss_reason text` em `leads` (migration). Depois usar em relatório (#16).

---

## FASE 2 — Cadência & não-esquecer (maior valor operacional)

**Meta:** fechar o buraco entre "enviei" e "fechei". Hoje follow-up é manual e único (`followup_at` + `followup-card.tsx` com +1/3/5/7/10d).

### #1 — Follow-up auto-sugerido ao marcar "Enviado" · M · sem schema (usa `followup_at`)
- **O quê:** ao marcar `enviado` (na fila/celular), já propor "lembrar em 3 dias?" com 1 clique, em vez de exigir abrir a ficha.
- **Como:** no fluxo de `markSent` (`fila/page.tsx`) e no `celular/page.tsx`, após enviar, mostrar um prompt/toast com chips (+2d/+3d/+5d) que setam `followup_at`. Reusa a lógica do `followup-card.tsx`.
- **Decisão:** sugerir um default (ex.: +3d) ou exigir escolha.

### #3 — Alerta de "leads esfriando" · M · sem schema
- **O quê:** lista/aviso "enviado há X dias, sem resposta e sem follow-up". `daysInStatus` já é calculado na ficha.
- **Como:** novo bucket na Início ("O que fazer agora") — "Esfriando (sem toque há +N dias)", derivado de `leads` (status `enviado`/`sem_resposta` + `updated_at`/`followup_at` antigos). Sem backend.
- **Decisão:** o limiar (5 dias? configurável?).

### #2 — Cadência multi-toque (régua) · L · schema novo
- **O quê:** sequência D0→D3→D7 (cada toque com mensagem própria); ao completar um toque, o próximo já fica agendado. É a evolução do follow-up único.
- **Como:** definir uma "cadência" (lista de passos: offset em dias + template). Ao enviar, instanciar a régua pro lead; cada follow-up concluído agenda o próximo. UI em `ficha` + buckets na Início. **Continua manual** (sugere, não dispara).
- **Schema:** tabela `cadences` (modelos) e `lead_cadence_steps` (estado por lead) — OU campos JSON no lead. Decisão de modelagem.
- **Depende de:** #18 (templates) combina bem; pode usar texto fixo primeiro.

---

## FASE 3 — Ação rápida no card (UX, baixo risco)

**Meta:** agir sem navegar. A state-machine já permite as transições; falta o atalho onde o usuário está.

### #5 — Botões de status rápidos no card · M · sem schema
- **O quê:** "Respondeu / Sem interesse / Marcar reunião" direto no card da fila/celular/Início, sem abrir funil/ficha.
- **Como:** usar `nextStatuses(status)`/`canTransition` (state-machine) pra renderizar 2–3 ações contextuais no card. Reaproveita `repo.transition`.

### #6 — Nota rápida + registrar resposta do card · S–M · sem schema
- **O quê:** jogar nota de 1 linha e marcar "respondeu" sem abrir a ficha (as anotações hoje só existem dentro da ficha).
- **Como:** input inline no card / mini-popover. Persistir na nota do lead (campo já existe na ficha).

### #7 — Lote assistido no celular · M · sem schema
- **O quê:** modo "fila contínua" no `celular/page.tsx`: envia este → marca → abre o próximo automaticamente. Reduz toques numa sessão de 30 leads.
- **Como:** estado de "sessão de envio" que avança pro próximo card após `markSent`. Sem disparo automático (cada envio é 1 toque do usuário).

---

## FASE 4 — Descoberta esperta

**Meta:** melhorar a qualidade/eficiência da entrada do funil. Reusa `scan_coverage` e os sinais já capturados.

### #9 — Filtro por sinal de qualidade · M · sem schema
- **O quê:** filtrar fila/contatos por "já anuncia" (`ads_active`), "site lento" (PageSpeed), "sem site", etc. Define o ângulo de venda. Sinais já existem no `Lead`.
- **Como:** adicionar filtros na `fila/page.tsx` e `contatos/page.tsx` sobre os campos de sinal. Client-side.

### #10 — Garantia visível de "não repetir" · S–M · sem schema (usa `scan_coverage`)
- **O quê:** na busca, avisar "essa zona já está X% coberta — quer ir pra uma nova?". `scan_coverage` já registra cobertura.
- **Como:** em `buscar/page.tsx`, ler `scan_coverage` da região/nicho selecionados e mostrar o status antes de rodar.

### #8 — Salvar buscas / presets · M · schema leve
- **O quê:** salvar combinações (ramo+cidade+bairro+raio) nomeadas e re-rodar com 1 clique. (+ opcional: **busca agendada por preset** — estende o autopilot.)
- **Como:** UI de presets em `buscar`. Salvar no perfil ou tabela própria.
- **Schema:** tabela `search_presets` (owner_id, nome, params JSON) — migration. Agendamento recorrente: campo de cron/dia no preset + a esteira lê (cross-stack, opcional numa 2ª etapa).

---

## FASE 5 — Notificações (infra; amplifica 2/3/6)

**Meta:** alcançar o usuário com o app FECHADO. Hoje o sino (`app-shell.tsx`) só vê reuniões 48h e só com app aberto.

### #4 — Notificações proativas · L · infra nova
- **O quê:** "lead respondeu", "reunião em 1h", "follow-up vencendo hoje", "novos prontos na fila". (+ resumo diário "comece o dia por aqui"; + lembrete de preparo de reunião com link pro diagnóstico que já existe.)
- **Como (decisão de canal):**
  - **Web Push** (service worker + Push API + assinatura por dispositivo) — melhor experiência, mais infra (precisa SW, VAPID keys, endpoint de envio).
  - **E-mail** via cron (mais simples; o resumo diário cabe bem) — usar um provedor de e-mail; a esteira/cron pode disparar.
  - **WhatsApp pessoal do usuário** (lembrete pra si mesmo) — cuidado pra não confundir com "nada sai sozinho" (isso é notificação ao OPERADOR, não ao lead).
- **Backend:** um job (cron/Action ou Supabase scheduled function) que calcula os gatilhos (reunião próxima, follow-up vencido, resposta detectada) e envia pelo canal escolhido.
- **Decisões:** canal(is); quais gatilhos no MVP; opt-in de notificação.
- **Depende de:** conceito de follow-up/cadência (Fase 2) pra "follow-up vencido".

---

## FASE 6 — Retenção / pós-venda (reusa `deal_*`; alertas dependem da Fase 5)

**Meta:** parar de "esquecer" quem fechou e reaquecer quem esfriou — receita barata parada no banco.

### #15 — Conceito de "Cliente" pós-fechamento · M–L · schema leve
- **O quê:** lead `fechado` vira parte de uma **base de clientes** com contrato ativo, não some. Hoje fechado é esquecido.
- **Como:** uma visão/aba "Clientes" (filtra `fechado` + dados de contrato `deal_*`). Possível flag `is_client`/estado de contrato.
- **Schema:** talvez `contract_status`, `contract_renewal_at` em `leads` (ou tabela `clients`). Decisão de modelagem.

### #16 — Reativação de frios + alerta de renovação · M · usa dado existente (+ #5 pra push)
- **O quê:** filtro/campanha "frio há 30/60 dias" (`sem_resposta`/`sem_interesse`/`perdido` antigos) + aviso "contrato do cliente X vence em 30 dias" (`deal_term_months` + `deal_closed_at`).
- **Como:** bucket/relatório de frios em Início/Contatos; cálculo de vencimento pra alerta (idealmente via Fase 5). Reativação reaproveita templates (#18).

---

## FASE 7 — Templates & controle do robô (cross-stack)

### #18 — Biblioteca de templates · M · schema novo
- **O quê:** modelos reutilizáveis (abertura, follow-up, quebra de objeção, reativação) com variáveis (nome/bairro/ramo). Hoje só `draft_msg1/2` por lead.
- **Como:** CRUD de templates; aplicar num lead substituindo variáveis. A IA pode usar como base.
- **Schema:** tabela `message_templates` (owner_id, nome, corpo, tipo). Casa com #2 e #16.

### #20 — Tags manuais + import CSV · M · schema leve
- **O quê:** etiquetar leads ("indicação", "VIP", "evento X") pra segmentar; importar CSV (já exporto, não importo).
- **Como:** campo `tags text[]` em `leads` (migration) + UI de tags na ficha/contatos; importador CSV que mapeia colunas → `repo.create`.
- **Nota:** o `new-lead-dialog` (deletado, era órfão) tinha a lógica de criação manual — reconstruir no padrão atual se necessário pro import.

### #19 — Controle do robô na tela · L · cross-stack (front + esteira Python)
- **O quê:** regular volume vs qualidade, **score mínimo** pra entrar na fila, pausar/retomar nicho/cidade. Hoje fixo no backend (batch 60/2h, profundidade, score) na esteira.
- **Como:** campos de config no perfil/tabela que a **esteira (Python)** lê a cada ciclo. Front em `config/page.tsx`; backend em `esteira/`.
- **Decisão:** quais parâmetros expor com segurança.

---

## FASE 8 — Equipe / multiusuário (arquitetural; fase SaaS)

### #21 — Multiusuário com atribuição de leads + papéis/ranking · L+ · arquitetural
- **O quê:** dar acesso a SDR/vendedor, **atribuir leads**, ver "quem cuida do quê", papéis (além de admin/não-admin), ranking de desempenho/comissão.
- **Como:** hoje tudo é `owner_id` (single-user). Precisa: modelo de **organização/time**, `assigned_to` por lead, RLS revista (membro vê leads da org/atribuídos), papéis, e relatórios por pessoa.
- **Schema:** tabelas `orgs`, `org_members` (papel), `assigned_to` em `leads`; RLS reescrita. **Mudança grande** — alinhar com o roadmap SaaS (memória `project-vision-saas-roadmap`).
- **Por último:** maior risco e maior dependência arquitetural.

---

## Resumo / dependências

| Fase | Itens | Schema novo? | Depende de |
|------|-------|--------------|------------|
| 1 Métricas | 11, 12, 13, 14, 17 | só #17 (`loss_reason`) | — |
| 2 Cadência | 1, 3, 2 | só #2 (cadência) | #18 ajuda (#2) |
| 3 Ação rápida | 5, 6, 7 | não | — |
| 4 Descoberta | 9, 10, 8 | só #8 (presets) | `scan_coverage` |
| 5 Notificações | 4 | assinaturas push (se push) | Fase 2 (follow-up vencido) |
| 6 Retenção | 15, 16 | leve (contrato) | Fase 5 (alertas), #18 |
| 7 Templates/Robô | 18, 20, 19 | 18, 20; 19 cross-stack | esteira (#19) |
| 8 Equipe | 21 | grande (orgs/RLS) | fase SaaS |

**Sugestão de início (melhor retorno/esforço):** Fase 1 inteira (rápida, prova ROI, zero risco), começando por **#11** (taxa de conversão — o cálculo já existe em `funnel.ts`).

**Para cada item, antes de codar:** rodar a skill `superpowers:brainstorming` se houver decisão de produto aberta (canal de notificação, modelagem de cadência, dimensões de relatório), e `superpowers:writing-plans` pra detalhar a fase em tasks bite-sized antes de executar.
