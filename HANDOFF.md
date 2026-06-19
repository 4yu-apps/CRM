# HANDOFF, redesign 4YUmkt (de onde o proximo agente parte)

> Documento de continuacao. Leia inteiro antes de codar. O sistema base ja
> esta no ar (F0); estamos no meio de um **rebuild de front** guiado por um
> layout de referencia. Regra de ouro desta fase: **dados reais, nada de mock
> como produto, nada de semear dados de exemplo.**

---

## 0. Comece por aqui (o proximo passo concreto)

O front novo (pagina Fila) quebrou em producao/dev porque le do **Supabase
real**, e o banco real **ainda nao tem a coluna `service_target`** (a migration
da B1 nunca foi criada/aplicada). Entao o primeiro bloco de trabalho e:

1. Criar a migration `service_target` (enum + coluna) e as outras colunas novas
   (precificacao/B8), aplicar no Supabase real (`npm run db:push`).
2. Ajustar a **esteira** (Python) pra produzir os campos que o front novo
   espera: `service_target`, `score_reason.summary` (motivo em PT),
   `score_reason.criteria` (sinais), `draft_msg1` e `draft_msg2`.
3. Construir a **captacao real do Maps** (extensao, B7) pra o banco encher com
   leads de verdade (o dono vai capturar pra testar). **Nao semear exemplos.**
4. Confirmar/setar a env da Vercel `NEXT_PUBLIC_DATA_SOURCE=supabase` (senao
   producao mostra mock).
5. Continuar as paginas C1, C3..C8 lendo o dado real.

O plano detalhado e fase a fase esta em **`PLANO-DE-EXECUCAO.md`**. Este handoff
e o resumo de estado + de onde retomar.

---

## 1. Contexto e fontes da verdade

- Produto: **CRM | 4YUmkt** (codinome Garimpo). Prospeccao assistida por IA com
  humano no loop. No ar: https://crm.4yumkt.com.br
- Usuario-persona: **Rafa**, gestor de trafego leigo em tech. Vende DOIS
  servicos: **trafego** e **automacao/chatbot**.
- **Layout de referencia (fonte da verdade visual e de funcionalidade):**
  `claude-design-ref/` na raiz do repo.
  - `claude-design-ref/4YUmkt.dc.html` = prototipo Claude Design com as 8 telas
    (Inicio, Fila, Ficha completa, Buscar, Funil, Resultados, No celular,
    Configuracao) + modal de envio. Tem o design system completo (cores roxas,
    Plus Jakarta Sans + Space Grotesk, icones Phosphor, mapa Leaflet) e a logica
    de demo (estado, seed, drag do funil, atalhos). **E so prototipo**: nao tem
    backend, script Python nem regra de negocio. Use como guia de UI e de
    interacao, nao como codigo final.
  - `claude-design-ref/uploads/garimpo-funcoes-da-plataforma.md` = as 14 funcoes
    da plataforma + as 7 sensacoes que o Rafa precisa sentir. E a spec de
    PRODUTO (o que faz), independente de tela.
- Docs de planejamento (ja escritos, leia nesta ordem):
  1. `PLANO-DE-EXECUCAO.md` = o plano do rebuild (trilhas A/B/C, pagina a
     pagina, DoD, mapeamento do funil, decisoes fechadas). **Principal.**
  2. `PLANEJAMENTO.md` = roadmap anterior (a parte de FRONT foi superada pelo
     PLANO-DE-EXECUCAO; a parte de DADOS/backend continua valida).
  3. `GUIA-COPY-HUMANA.md` = regras da mensagem de prospeccao (alimenta a IA de
     copy).
  4. `PROXIMOS-PASSOS.md` = handoff original do projeto base (ainda util pra
     stack/convencoes).

---

## 2. Decisoes cravadas (NAO reabrir sem o dono)

- **Dados reais, sem mock como produto, SEM semear.** O banco real enche pela
  **captacao real do Maps** (extensao). Nada de inserir leads de exemplo no
  Supabase. O `mock` do front existe SO como ambiente de dev offline pra codar
  sem bater no banco; nunca e o que o dono ve.
- **2 servicos fica** (trafego x automacao x ambos). Badge no card, sinais e
  copy proprios por servico.
- **No celular = app responsivo/PWA** pra revisar a fila e enviar via `wa.me`.
  Injetar botoes dentro do WhatsApp no mobile NAO roda (sem extensao no mobile).
  A extensao segue desktop.
- **Itens que o prototipo nao mostrou, mantemos** (inserir com o design novo):
  LGPD opt-out, historico do funil, undo/arquivar/reativar, estado
  `sem_resposta`, segunda mensagem (`draft_msg2`).
- **Funil:** clicar no card abre a ficha; arrastar move o estagio. Drag respeita
  `transition_lead` (transicao invalida recusa). Colunas: Novo, Enviado,
  Respondeu, Interessado, Reuniao(+proposta), Fechou, Arquivados. Os estados
  internos (bruto/enriquecido/qualificado) NAO viram coluna.
- **Arrastar pra Reuniao pede a data** e cria evento no **Google Calendar** do
  usuario (login com Google linka a agenda; multi-usuario, token por owner).
- **Multi-tenant:** cada usuario tem seus leads (RLS `owner_id = auth.uid()` ja
  isola). Front usa sempre a sessao logada, zero owner hardcoded. A esteira deve
  rodar por-usuario (autopilot do perfil de cada um), nao um `OWNER_USER_ID` fixo.
- **Precificacao (B8, opcional):** campos de valor; a IA sugere um valor na
  Reuniao (localizacao + porte + anotacoes); no Fechou registra valor + tipo
  (mensal fixo ou por prazo X meses) + anotacoes (`notes`).
- **Zero travessoes, zero cara de IA** em copy/UI/prompt/commit/doc. Voz humana.
  (memoria `no-travessoes-no-ai-tells`).

---

## 3. O que ja foi feito (cronologico)

### F0 (no ar em producao, deployado)
- Higiene visual + voz humana: tirou badge de infra do cabecalho, aprovado
  passou de roxo pra verde, alargou o painel de detalhe, score com medidor,
  removeu travessoes de UI e copy. Commit `76c2ebe`.
- Acoes de lead: **reativar** (descartado -> enriquecido), **arquivar**
  (`archived`), **excluir**. Migration `20260619120010_lead_actions.sql`
  aplicada no Supabase real (db:push + db:verify rodados; banco com 25
  transicoes + coluna archived). Commit `0783528`.
- **Deployado em producao** (crm.4yumkt.com.br): so o F0.

### Plano (commitado, nao e codigo)
- `PLANEJAMENTO.md`, `GUIA-COPY-HUMANA.md`, `PLANO-DE-EXECUCAO.md`.

### Rebuild de front (commitado LOCAL, NAO deployado)
- **A1, shell + design system** (commit `921202b`):
  - Tokens roxo claro/escuro no `front/src/app/globals.css` (mapeados nos tokens
    shadcn + vars de marca: brand, grad, ink, success, danger, wa, etc.).
  - Fontes Plus Jakarta Sans + Space Grotesk (`front/src/app/layout.tsx`),
    icones Phosphor (`@phosphor-icons/react` instalado), tema via next-themes.
  - `front/src/components/app-shell.tsx`: sidebar 7 destinos + header
    (titulo/sub por rota + pill da fila) + toggle de tema + nav inferior no
    mobile.
  - Grupo de rotas `front/src/app/(app)/` com 8 paginas. As internas usam
    `front/src/components/placeholder.tsx` (stubs) menos a Fila.
  - Removeu a home/dashboard antigas e a NavBar velha; login fora do shell.
- **B1 (so a fatia de front) + C2 Fila + seed de dev** (commit `82d651d`):
  - `front/src/lib/types.ts`: `ServiceTarget` + `service_target`/`ads_active` no
    Lead; `ScoreReason.summary`.
  - `front/src/lib/service.ts`: badge trafego/automacao/ambos.
  - `front/src/lib/repo/mock-data.ts`: REESCRITO com 12 leads do prototipo
    (so pro modo dev offline). NAO e dado real.
  - `front/src/app/(app)/fila/page.tsx`: **Fila completa e funcional** (revisao
    1 a 1, atalhos A/D, motivo + sinais, badge de servico, msg1+msg2 editaveis,
    descartar com desfazer, aprovar -> modal de envio wa.me / marcar enviado,
    fila zerada). Le do `getRepo()` (mock ou supabase).
  - Fallback defensivo no service badge (`SERVICE_META[...] ?? indefinido`) pra
    nao quebrar quando o lead nao tem `service_target`.

---

## 4. Estado do codigo (o que existe vs falta)

| Item | Estado |
|---|---|
| Shell + design system (A1) | feito, local |
| Pagina Fila (C2) | feita e funcional (le repo), local |
| Paginas Inicio/Ficha/Buscar/Funil/Resultados/Mobile/Config | **stubs** (placeholder) |
| `service_target` no banco real | **NAO existe** (sem migration, sem db:push) |
| Esteira produz service_target/summary/sinais/2 mensagens | **NAO** (scoring ainda 1 ICP, draft generico) |
| Auth com Google + onboarding (A2) | **NAO** (so o auth antigo email/senha + AuthGate) |
| scan_coverage / search_profile / activity_log / precificacao | **NAO** (so no plano) |
| Google Calendar (B6) | **NAO** |
| Captacao real do Maps (B7) | **NAO** (extensao so WhatsApp; `repo.mjs` sem insert) |
| Gemini real (B5) | **NAO** (provider existe, nao ligado) |
| Componentes antigos orfaos | `leads-table`, `lead-detail-sheet`, `nav-bar`, `status-actions`, `score-meter`, `funnel-filter`, `stats-bar`, `kpi-cards`, `funnel-chart` ficaram sem uso depois do restructure. Reaproveitar logica (state-machine, funnel, format) e descartar o resto. |

---

## 5. O que falta, na ordem (resumo do PLANO-DE-EXECUCAO)

**Trilha de dados (real):**
- Migration `service_target` (enum+coluna) + precificacao (B8) + `search_profile`
  (B2, com raio + autopilot) + dedup nome+endereco + `scan_coverage` (B3) +
  `activity_log` (B4). Aplicar no Supabase real (db:push).
- Esteira: `scoring.py` em 2 ICPs (trafego/automacao), decide `service_target`,
  monta `score_reason.summary`+sinais; `draft/` escreve msg1+msg2 por servico
  (segue GUIA-COPY-HUMANA). `models.py`/sink com os campos novos. Esteira
  por-usuario (multi-tenant).
- **B7 captacao real do Maps** (extensao): `repo.mjs` ganha `insertLead`; content
  script no `google.com/maps/*`; raspagem resiliente; dedup. E o que enche o
  banco real (o dono vai testar capturando). Sem isso, sem dado real.
- B5 Gemini real; B6 Google Calendar (degrada com graca ate o dono configurar o
  console Google + a key Gemini).

**Trilha de paginas (cada uma le o dado real, DoD = correta+funcional+funcionando):**
- C8 Config (perfil/onboarding), C1 Inicio (hero + feed activity_log + meta),
  C3 Ficha (dados+fonte, sinais, historico, LGPD, acoes, valor), C4 Buscar
  (form + cobertura Leaflet), C5 Funil (kanban click=ficha + drag=transition +
  Reuniao pede data->Calendar + Fechou registra valor), C6 Resultados
  (KPIs+deltas semanais do historico), C7 Mobile/responsivo.
- A2 auth multi-tenant (login com Google + email/senha) + onboarding.

---

## 6. Pendencias que dependem do dono (precisam do console/OK dele)

- **db:push** (aplicar migrations no Supabase real): o classificador do harness
  bloqueia por padrao; o dono libera/roda. Ja foi rodado pro F0, com OK dele.
- **Vercel env**: setar `NEXT_PUBLIC_DATA_SOURCE=supabase` em Production (conferir
  se nao esta em mock). Deploy: `npx vercel deploy --prod --token $VERCEL_TOKEN
  --scope 4-yu-mkt` de dentro de `front/`.
- **Google OAuth (Calendar)**: configurar o provider Google no Supabase + escopo
  `calendar.events`. So o dono faz no console.
- **Gemini**: `GEMINI_API_KEY` no `.env` + secret do GitHub + `GARIMPO_LLM=gemini`.
- **Captacao**: o dono roda a extensao no Google Maps pra capturar leads reais de
  teste. **Decisao do dono: NAO semear exemplos; so dado capturado.**

---

## 7. Como rodar / verificar (dev)

```bash
# front (o dono roda em supabase; pra dev offline use mock)
cd front && npm run dev            # localhost:3000
npm run lint && npm run build      # tem que passar limpo
# regras de front: front/AGENTS.md (Next 16, Base UI sem asChild, Phosphor,
#   lint pega static-components e set-state-in-effect)

# schema
npm run db:validate                # valida offline (pglite); atualize ao mexer
npm run db:push && npm run db:verify   # aplica no Supabase real (OK do dono)

# esteira
cd esteira && python -m pytest

# extensao
cd extension && node --test && npm run build   # regenera content.bundle.js
```

Convencoes que continuam: commits pt-BR + trailer `Co-Authored-By: <modelo>
<noreply@anthropic.com>`; push por etapa; segredo so em `.env` (repo PUBLICO);
espelhar a maquina de estados nos 3 lugares (banco/front/extensao); status so
via RPC `transition_lead`; **sem travessoes**.

---

## 8. Resumo em uma frase

O base esta no ar (F0). O front esta sendo refeito a partir de
`claude-design-ref/` (shell + Fila prontos, resto stub). Agora e fazer o
**banco real** ter os campos novos e o **pipeline real** (captacao + esteira)
produzir os dados, ligar o front no Supabase e construir as paginas que faltam.
**Sem mock como produto, sem semear: so dado real capturado.** Parta da secao 0.
