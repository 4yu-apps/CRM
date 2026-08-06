# Handoff: virar CRM de gestão

> Para quem assume daqui. O plano original está em
> [`plano-crm-gestao-2026-08-06.md`](plano-crm-gestao-2026-08-06.md); este
> arquivo diz **o que foi feito**, **o que mudou de ideia no caminho**, **o que
> falta** e **como não repetir as armadilhas que já custaram tempo**.
>
> Atualizado em 2026-08-06, ao fim da Fatia 5.

---

## Como trabalhar aqui (o dono pediu, não é sugestão)

### 1. Revisão cética, como dev e como UX

Toda entrega passa por duas revisões, e nenhuma hipótese vale sem prova contra o
código. O dono validou esse modo explicitamente depois que ele achou coisas que
a implementação sozinha não acharia.

- Levantar hipótese, depois **provar ou derrubar** com grep, leitura ou teste
  real. Citar arquivo e linha. **Hipótese derrubada também se relata**: economiza
  o trabalho de quem vier depois.
- Rodar o que já existe **antes** de mexer, pra saber o que já estava vermelho.
  O `db:validate` estava vermelho há meses e ninguém via.
- Escrever teste que falha **pelo motivo certo**. Quando o teste corrige o
  desenho, muda o desenho, não o teste.
- Separar **fato** de **julgamento** na regra de negócio. Guarda que ignora essa
  diferença cria dado incoerente.
- **Dizer o que não foi verificado.** "Não abri no navegador" é informação.

### 2. Prova por mutação

Teste que nunca falhou é decoração. Depois de escrever, **quebre de propósito**,
confirme vermelho, reverta, confirme verde. Foi assim que se soube que o teste do
dropdown e o do MRR realmente pegam.

### 3. Release por fatia (autorizado, não perguntar)

Ao fim de cada fatia: commits atômicos, merge na `main`, push, deploy.

1. **Banco antes do código, sempre.** `npm run db:push:dry`, depois `db:push`, e
   **provar por query direta** que a coluna/tabela existe em produção. Front que
   envia campo inexistente quebra todo cadastro.
2. **O repositório é PÚBLICO.** Varredura de segredo no diff antes do push.
3. Verificar na `main` **já mergeada**, não na branch.
4. `cd front && vercel deploy --prod --token=$VERCEL_TOKEN --yes`
5. **Provar fora do console**: buscar uma string exclusiva do código novo nos
   chunks que `crm.4yumkt.com.br` serve. "Ready"/"Finished" não é prova.
6. **Não commitar o que já estava sujo** antes de começar. Hoje isso é
   `README.md`, `.claude/settings.json`, `.antigravitycli/` e dois scripts em
   `scripts/`. Pra editar um deles, isolar com `git stash push -- <arquivo>`.

### 4. Convenções do repo

pt-BR, **zero travessão e zero cara de IA** em copy, UI, commit e doc (ver
`GUIA-COPY-HUMANA.md`). Commits em pt-BR sem acento no assunto. Migrations
append-only. Offline-first (interface + mock + supabase).

---

## Como testar

```bash
npm run db:validate            # schema num Postgres embutido (pglite, sem docker)
cd esteira && .venv/bin/python -m pytest   # 557 testes (o `python` do sistema nao tem pytest)
cd extension && node --test    # 43 testes
cd front && npm test           # 119 testes (vitest)
cd front && npm run e2e        # 52 testes (playwright, desktop + mobile)
cd front && npm run lint && npx tsc --noEmit && npm run build
```

A casa de testes do front foi montada na Fatia 1 (antes disso o front não tinha
como rodar teste nenhum).

**O teste mais valioso do repo** é `front/src/lib/state-machine.test.ts`. A
máquina de estados vive em **quatro lugares** que precisam concordar:

1. `supabase/migrations` (fonte da verdade, um trigger valida)
2. `front/src/lib/state-machine.ts`
3. `esteira/src/garimpo_esteira/state_machine.py`
4. `extension/src/lib/state-machine.mjs`

O teste sobe as migrations num Postgres real e compara os quatro. Quando divergem
o sintoma **não é erro de build**: é um botão que aparece na tela, o usuário
clica, e o banco responde "Transicao de status invalida" em produção. Foi assim
que se achou `aprovado -> descartado` faltando no banco.

`front/src/lib/activities.db.test.ts` e `front/src/lib/payments.db.test.ts` fazem
o mesmo estilo pros triggers de `last_activity_at` e `paid_until`. Os dois
triggers recalculam o `max` em vez de comparar com o que acabou de chegar, e é
isso que os testes cobram: apagar o registro mais recente tem que devolver o
anterior, não deixar data fantasma.

---

## Armadilhas que já custaram tempo (leia antes de debugar)

| Armadilha | Sintoma | O que é |
|---|---|---|
| **Build velho na porta 3100** | Comportamento não bate com o código; parece bug que você acabou de introduzir | `reuseExistingServer` do Playwright reaproveita um servidor vivo. Depois de um teste de mutação, **mate a porta e rebuilde**: `fuser -k 3100/tcp` e `npm run build`. Isso enganou 3 vezes |
| **`pkill -f "next start"`** | Comandos cortados no meio, exit 144 | O padrão casa com o próprio shell, que contém a string, e ele se mata. Use `fuser -k 3100/tcp` |
| **`page.goto` zera o mock** | Dado criado no passo anterior some | O repo mock vive na memória do módulo; recarregar reseta. **Navegue clicando** nos links do menu |
| **Nome duplicado no mock** | Cadastro não salva, sem erro visível | Índice único em `(owner_id, nome + endereço normalizados)`. Nomes do seed ("Studio Bella Estetica", "Pilates Corpo Leve") colidem |
| **Playwright clica no invisível** | Teste verde, usuário travado | `opacity: 0` ainda é clicável. Pra afordância revelada no hover, **teste a opacidade**, não só o clique. Foi assim que o botão de apagar toque ficou inalcançável no celular |
| **Rótulo repetido** | `strict mode violation` | Geralmente é problema de UX de verdade, não de teste: dois botões com o mesmo nome confundem gente também |
| **`updated_at` como proxy de "quando"** | Números de receita e abandono mentem | Ele sobe quando o robô enriquece ou alguém corrige a cidade. Use `deal_closed_at`, `last_activity_at` ou `churn_at` |
| **Enum novo + uso na mesma migration** | `unsafe use of new value` | Postgres recusa. Precisa de **dois arquivos**: um só com o `alter type add value`, outro com o resto |
| **`setMonth(+1)` transborda** | Aviso de renovação chega dias depois do dia certo | `new Date(2026,0,31).setMonth(+1)` dá **3 de março**: o JS aceita "31 de fevereiro" e desliza. Use `addMonths` do `format.ts`, que gruda no último dia do mês |
| **Menu do celular esconde metade das telas** | `waitForURL` estoura só no projeto `mobile` | Só cinco itens cabem no rodapé; Clientes e Resultados moram atrás do botão **Mais**. Teste de celular precisa abrir o sheet antes de clicar no link |
| **Rodar suíte em cima de suíte** | 3 arquivos de pglite falham juntos, sem erro de asserção; a WSL pode cair | O gargalo é a máquina, não o código. Rode **um comando por vez**; a suíte passou 4x seguidas depois disso |
| **`python` não existe** | `command not found` no `pytest` | A esteira tem venv própria: `esteira/.venv/bin/python` |

---

## O que já foi feito

Merges na `main`: `01ab224` (Fatia 1), `aa31657` (Fatia 2), `871883f`
(Fatia 3), Fatia 5 logo abaixo. Todas no ar em `crm.4yumkt.com.br`, com
migrations aplicadas em produção e conferidas por query direta.

### Fatia 1 · Cadastrar e corrigir

- **Cadastro manual** (`components/new-contact-modal.tsx`), botão em Contatos.
  Um formulário, duas intenções: lead nasce em `bruto`, cliente nasce em
  `fechado`. Isso é legítimo porque o gatilho da máquina de estados é
  `BEFORE UPDATE`, não INSERT: um lead pode **nascer** em qualquer estado.
- **Negócio editável na ficha** (`components/deal-card.tsx`), com estado vazio
  que cobra o valor quando falta.
- **`leads.manual`** + guarda na esteira: lead digitado à mão não some por nota
  baixa. Mas **descarte por fato** (empresa não-ATIVA na Receita, sem telefone e
  sem e-mail) continua valendo: ali não há julgamento pra revisar.
- **Casa de testes do front**: vitest + playwright, do zero.

Três bugs de produção corrigidos: `parseFloat(v.replace(",","."))` gravava
`"2.500,00"` como **R$ 2,50**; `aprovado -> descartado` faltava no banco mas o
botão aparecia; o modal cortava o botão Salvar em notebook de 768px.

### Fatia 2 · Linha do tempo

- **`lead_activities`** com `happened_at` separado de `created_at` (dá pra
  registrar hoje uma ligação de ontem).
- **`leads.last_activity_at`** desnormalizado por trigger, porque Contatos
  carrega a base inteira em memória e um join sairia N+1. O trigger **recalcula**
  em vez de comparar, senão apagar o toque mais recente deixaria data fantasma.
- **Timeline unificada** na ficha: status e toque numa lista só.
- **Fim do escritor duplo**: a ação rápida do kanban prependia
  `[dd/mm/aaaa]` em `leads.notes` e o textarea da ficha sobrescrevia tudo. Agora
  evento vai pra timeline, anotação livre fica no `notes`.
- **`lastTouchAt()`** (`lib/activities.ts`): o alerta de abandono usa fallback
  pra `updated_at`, a coluna de Contatos **não**. São perguntas diferentes, e a
  divergência é proposital e documentada.

### Fatia 3 · Clientes vira carteira

- **Churn**: estado `cancelado` + `churn_at`/`churn_reason`. Não passa pelo
  funil: cliente que sai não é lead perdido, e misturar sujaria a taxa de
  fechamento.
- **MRR parou de mentir**: soma só quem continua. Antes somava todo mensal fixo
  já fechado, pra sempre.
- **Contrato mensal deixou de ser cego**: `renewalDate` só olhava `por_prazo`,
  então metade da carteira nunca gerava aviso. Agora marca o **aniversário
  anual** (mensal seriam 12 avisos por ano por cliente, e alerta que toca sempre
  ninguém lê).
- **Tela reorganizada**: abas Atenção / Ativos / Encerrados, abrindo onde há o
  que fazer. "Reativar frios" saiu (é prospecção, não carteira).
- **Moldura**: a ficha parou de chamar cliente de lead.
- **Resultados**: MRR com uma definição só, "fechou neste mês" pelo
  `deal_closed_at`, e card de churn.

### Fatia 5 · Financeiro leve

O `deal_value` respondia uma pergunta e o app usava ele como se respondesse
três: **contratado** (o que foi combinado), **faturado** e **recebido**. Um
cliente de R$1.500 fechado em janeiro somava R$1.500 de MRR em agosto mesmo sem
ter pagado desde março. O número não estava errado por bug: estava respondendo
outra pergunta.

- **`lead_payments`**: quanto entrou, quando (`paid_on`), e até quando cobre
  (`covers_until`). Não é parcelamento, boleto, nota nem banco: é caderninho.
- **`leads.paid_until`** desnormalizado por trigger, mesmo padrão e mesma
  justificativa do `last_activity_at`. O trigger **recalcula o max**, então
  apagar um recebimento digitado errado devolve a cobertura anterior.
- **`amount` guardado por recebimento**, e não reconstruído de `deal_value ×
  meses`. Reconstrução mente no dia em que o preço muda, e preço de agência
  muda.
- **Alerta de atraso** na aba Atenção, na frente de tudo: contrato que vence é
  problema do mês que vem, cliente que parou de pagar já é deste mês. Com
  tolerância de 3 dias, porque boleto compensa em um ou dois.
- **Resultados mostra recebido colado em contratado.** Separados por telas
  diferentes, o que a pessoa lembra é sempre o maior.

**A decisão que mais importa aqui:** `paid_until` vazio quer dizer *ninguém
acompanha*, não *caloteiro*. No dia do deploy a carteira inteira está assim, e
tratar as duas coisas igual poria todo mundo em alerta de uma vez. É a mesma
lição do `last_activity_at` na Fatia 2, e há teste cobrando os dois lados: uma
mutação que trocou esse `null` por "vencido desde sempre" derrubou **9 testes
que já existiam**, não só os novos.

Um bug de produção corrigido de passagem: `renewalDate` usava `setMonth(+1)`
cru, então contrato fechado em 31 de janeiro com prazo de um mês avisava em
**3 de março** em vez de 28 de fevereiro.

---

## O que falta

### Fatia 4 · Contas, contatos e negócios (~1 semana, **risco alto**)

O gargalo estrutural. Hoje uma linha de `leads` é 1 empresa = 1 pessoa = 1
telefone = 1 negócio. Carteira real tem sócio, gerente de marketing e financeiro
(N contatos), e o cliente fecha tráfego em janeiro e site em março (N negócios).

**Caminho de menor dano, aditivo, nunca destrutivo:**

1. `lead_contacts` (N pessoas por lead). `leads.phone`/`owner_name` viram o
   contato primário por backfill. Nada quebra.
2. `deals` (N negócios por lead). `leads.deal_*` vira o deal primário por
   backfill; as telas leem `deals` quando existe, com fallback nos campos
   antigos.
3. Só depois, quando nada mais ler os campos antigos, deprecar.

**Não renomear `leads` pra `accounts`.** Ganho zero, risco alto: a tabela é lida
pela esteira, pela extensão, pelo front inteiro e por 9 scripts em `scripts/`.

**Antes de abrir**, confirme com o dono que a carteira já cresceu o bastante pra
sentir a falta. Modelar sem uso real é chutar. Perguntado em 2026-08-06, a
resposta foi **"vai ter em breve"**: ainda não dói, mas é questão de semanas.
Por isso a Fatia 5 veio antes.

### Dívidas menores, já mapeadas

- **Padrão de dívida que vale copiar:** quando um buraco é conhecido mas não vai
  ser resolvido agora, escreva um teste que **afirma o comportamento errado de
  hoje**, com comentário dizendo quando ele deve mudar de lado. Foi assim que o
  "contrato mensal nunca gera alerta" ficou registrado na Fatia 2 e cobrado na
  Fatia 3, em vez de virar cobertura fingida.
- **Contatos é um grid de divs sem semântica de tabela.** `getByRole("row")` não
  funciona lá. Dar `role` de verdade é melhoria de acessibilidade pendente.
- **Ticket médio inclui quem cancelou** (é histórico, de propósito), mas isso
  nunca foi confirmado com o dono.
- **A extensão não oferece churn** (decisão: registrar saída é de carteira, não
  de conversa no WhatsApp). Ela só conhece o rótulo do estado.
- **Sem verificação visual automatizada de regressão** (nada de screenshot
  diffing). A verificação visual é manual, via Playwright, a cada fatia.
- **O total "em atraso" soma um mês por devedor, não o acumulado.** O CRM sabe
  até quando o último recebimento cobriu, não quantos meses ficaram pra trás.
  Multiplicar por meses estimados seria chute com cara de número. Se a carteira
  passar a ter inadimplência de vários meses, essa conta precisa mudar.
- **Recebimento não tem edição, só criação e exclusão.** Digitou errado, apaga e
  registra de novo. Duas telas pra mesma coisa não se pagavam agora.
- **A ficha de cliente cancelado não mostra recebimentos.** Cobrar quem já saiu
  é cobrança, não gestão. Se virar necessidade, o histórico já está no banco.

---

## Mapa rápido do que foi criado

| Arquivo | Papel |
|---|---|
| `front/src/lib/clients.ts` | Regras de carteira: quem é cliente, MRR, atenção, churn. **Um lugar só**, porque a mesma pergunta é feita em 3 telas |
| `front/src/lib/activities.ts` | `lastTouchAt` e o fallback documentado |
| `front/src/lib/payments.ts` | Dinheiro que **entrou**: soma por período, próxima cobertura. Quem está **devendo** mora em `clients.ts`, que é pergunta de carteira |
| `front/src/lib/format.ts` | `parseBRL`, as datas fixadas ao meio-dia local, e `addMonths` (que não transborda) |
| `front/src/components/lead-timeline.tsx` | Timeline unificada |
| `front/src/components/new-contact-modal.tsx` | Cadastro manual |
| `front/src/components/churn-modal.tsx` | Saída de cliente |
| `front/src/components/deal-card.tsx` | Negócio na ficha (o que foi combinado) |
| `front/src/components/payments-card.tsx` | Recebimentos na ficha (o que entrou) |
| `scripts/schema-offline.mjs` | Aplica as migrations num pglite. Usado pelo `db:validate` **e** pelos testes |

Migrations das quatro fatias: `20260806120000` até `20260806160000`.
