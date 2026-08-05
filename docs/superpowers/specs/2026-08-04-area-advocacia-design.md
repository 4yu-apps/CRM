# Área Advocacia — o advogado como dono da conta

**Data:** 2026-08-04
**Autor:** Gabriel (mantenedor) + Claude
**Status:** aprovado, aguardando plano de implementação

## Problema

O catálogo de áreas em `front/src/lib/professions.ts` tem sete profissões e todas
são a mesma pessoa: alguém que vende serviço de marketing/digital para negócio
local. Um advogado que queira usar o Garimpo para achar clientes não tem onde se
encaixar — e se escolher qualquer área existente, recebe a leitura errada do
começo ao fim: score de presença digital, IA falando de maturidade de site, copy
vendendo tráfego e honorário sugerido de R$ 700/mês.

Pior: os dados que o advogado mais quer **já são baixados e descartados**. A
consulta de CNPJ traz natureza jurídica, opção pelo Simples, opção pelo MEI,
CNAEs secundários e o QSA completo no mesmo JSON de que hoje só extraímos
`socios_count` e o primeiro sócio.

## Princípio central

**O ICP jurídico é quase o inverso do de marketing.** Marketing qualifica quem
tem presença digital fraca; o advogado não olha Instagram, não olha engajamento,
não olha GMB e não pergunta se o negócio anuncia. Ele quer empresa formalizada,
com sócios, com folha, com superfície de conflito e sem assessoria aparente. O
site importa por um motivo só: ter ou não ter política de privacidade e termos.

E o desenho inteiro se apoia numa **muralha**:

> Os sinais de exposição jurídica servem para PRIORIZAR, nunca para abrir
> conversa.

A ficha mostra "nota 3.1 em 280 avaliações, reclamação recorrente de cobrança
indevida". A copy não pode encostar nisso. Se a muralha vazar, a mensagem vira
"vi que vocês estão sendo processados" e nenhum tom sóbrio salva.

## Restrição de conduta (decisão do dono do produto)

O Provimento 205/2021 do CFOAB trata captação de clientela e mercantilização
como infração; publicidade de advogado tem de ser informativa. A decisão tomada:
**a copy existe**, com a régua de *informar disponibilidade, não vender*. O
advogado se apresenta, diz a área de atuação e se coloca à disposição. Isso vira
restrição dura no prompt (seção D), não uma recomendação.

## Onde a área vive

Uma profissão nova `advocacia` em `professions.ts`, mais um campo
`legal_areas: string[]` no `search_profile` — trabalhista, tributário,
societário, consumidor, LGPD — exibido na config **apenas** quando advocacia
está marcada. Cinco cards jurídicos no seletor de área poluiriam a tela de todos
os outros usuários.

Mais `oab_number` e `oab_uf` no perfil: a assinatura do e-mail precisa deles.

A multi-seleção de áreas jurídicas reusa o mecanismo que já existe: assim como
`_offered_lenses` deriva as lentes de serviço das profissões do dono, as
`legal_areas` derivam os sub-pesos e o lead qualifica pelo **melhor encaixe**
entre elas.

## Mudanças por camada

### A. Dados novos — todos de graça

Nenhuma requisição HTTP nova. Tudo abaixo já é baixado hoje e jogado fora.

**`sources/cnpj.py`** (mesmo JSON da BrasilAPI/ReceitaWS):

| Campo | Estado | Para que serve |
|---|---|---|
| `natureza_juridica` | **novo** | LTDA/SA/EI/MEI — o filtro nº 1 |
| `cnaes_secundarios` | **novo** | risco por atividade (transporte, construção) |
| QSA completo (nome, data de entrada) | **novo** (hoje só `len(qsa)`) | societário, sucessão, quem decide |
| `opcao_pelo_simples` | já coletado (`cnpj.py:127-135`, cai em `site_signals.simples`) | fora do Simples = demanda tributária real |
| `opcao_pelo_mei` | já coletado (`site_signals.mei`) | MEI corta: é pessoa com CNPJ, não contrata advogado |

> Correção em relação à primeira versão deste spec: `opcao_pelo_simples` e
> `opcao_pelo_mei` **já são extraídos** hoje. Só os três primeiros são novos.

**`sources/website.py`** — três regex no HTML que já é baixado e analisado para
outras vinte flags: `has_privacy_policy`, `has_terms`, `has_cnpj_footer`. É o
proxy direto de "ainda não passou por advogado", e e-commerce sem termos é o caso
mais gritante.

**`sources/reviews.py`** — gatilhos de litígio sobre o `review_sample` que já é
guardado: procon, processo, processei, cobrança indevida, não devolveram, golpe.
Ressalva: `reviews_enabled=False` por padrão (custa Places Details), então só
vale para quem já passou do corte.

### B. Lente `score_advocacia` (`scoring.py`)

- **MEI corta.** Antes de qualquer outro critério.
- **Idade em U**: até ~18 meses (constituição, contratos, marca, LGPD) e 5+ anos
  com porte (passivo acumulado, sucessão). O meio fica morno.
- **Sócios contam a favor**: 2+ é acordo de sócios, saída, sucessão, conflito.
  Hoje `socios_count` só serve para dizer que a decisão de compra é mais lenta.
- **Capital social** como porte real, no lugar de avaliações no Maps.
- **Sem assessoria aparente**: ausência de política de privacidade / termos.
- **Atrito com consumidor**: nota baixa COM volume alto de avaliações.
- **Sub-pesos por `legal_area`** marcada; qualifica pelo melhor encaixe.
- **Fora do score**: seguidores, engajamento, recorrência de posts, GMB,
  `ads_active`, qualidade visual do site.

**Mudança em código compartilhado:** o corte duro de situação cadastral
(empresa não-ATIVA na Receita é descartada e "vence até score alto") passa a ser
**condicional à área**. Empresa inapta/suspensa é lead morto para tráfego e é
cliente para o advogado. Esta é a única alteração que toca o caminho das outras
áreas — vai com teste de regressão explícito.

### C. IA ciente da área (`ai_stage.py`)

`_AREA_ANGLE["advocacia"]`: `maturity` passa a ser **maturidade institucional**
(formalização, governança, assessoria aparente), não maturidade digital.

E o `pain` se parte em dois campos — é isto que sustenta a muralha:

- `exposure` — a exposição jurídica observada. **Interno**, só aparece na ficha.
- `context` — fato neutro e público (porte, tempo de casa, expansão, número de
  sócios). É o **único** campo que a camada de copy enxerga.

`_facts` ganha as firmografias novas (natureza jurídica, regime, QSA, CNAEs
secundários, flags de política/termos).

### D. Copy — dois artefatos, uma régua

Dois rascunhos por lead:

1. **WhatsApp curto** — reusa a esteira inteira (fila, régua de cadência,
   extensão, anti-ban). Só o texto muda.
2. **E-mail formal** — assunto + corpo + assinatura com nome e OAB. Campos novos
   `draft_email_subject` e `draft_email_body`. Sem envio automático, igual ao
   WhatsApp de hoje: botão de copiar na ficha.

O e-mail da empresa já vem da Receita (`cnpj.py` emite `email`), então o dado
existe sem coleta nova.

**Bloqueios explícitos no prompt** (`draft/prompt.py` e `draft/mock.py`), além
do brief de serviço profissional que já existe:

- sem promessa ou insinuação de resultado
- sem mencionar caso concreto, processo ou reclamação do lead
- sem valores, honorários ou condições
- sem urgência, medo ou escassez
- sem êxito passado, número de casos ou comparação com outro profissional
- a mensagem apresenta quem é, a área de atuação, e se coloca à disposição

O `_SELF_DESC` ganha a entrada de advocacia, e a copy fecha com identificação
(nome + OAB/UF), que é o que a publicidade informativa exige.

### E. Honorário (`pricing.py`)

Faixa própria de avença mensal, derivada de **capital social + porte da Receita
+ número de sócios**. O proxy atual (número de avaliações no Maps) é ruído para
este ICP: ninguém avalia escritório no Google como avalia pizzaria, e uma
empresa grande com poucas avaliações cairia em "porte pequeno".

O motivo em português acompanha o aviso de conferir o piso da tabela da
seccional — sugerir abaixo dela é aviltamento de honorários.

### F. Front

- **`front/src/lib/legal-signals.ts`** (novo, espelhando `marketing-signals.ts`):
  `legalSignalChips(lead)` liderando com natureza jurídica → sócios →
  porte/capital → situação na Receita → tempo de casa → assessoria aparente.
- **Ficha** (`ficha/[id]/page.tsx`): painel "Perfil jurídico" lidera quando a
  área é advocacia; o painel de presença digital recolhe abaixo. A exposição
  jurídica aparece aqui e **apenas** aqui.
- **Fila** (`quality-signals.ts`): filtros de "sem política de privacidade",
  "2+ sócios", "fora do Simples", "situação irregular", "reputação em atrito".
- **Ramos** (`ramos.ts`): entram Construtora, Transportadora, Distribuidora,
  Indústria e Imobiliária — B2B de densidade jurídica alta, hoje inexistentes.
  O resolvedor correspondente entra em `sources/overpass.py`.
- **Config e onboarding**: card da área nova, seletor de `legal_areas`, campos
  de OAB.

### G. Migrations

- `search_profile`: `legal_areas text[]`, `oab_number`, `oab_uf`
- `leads`: `draft_email_subject`, `draft_email_body`, `natureza_juridica`,
  `opcao_simples`, `opcao_mei`, `cnaes_secundarios jsonb`, `qsa jsonb`
- `site_signals` e `ai_signals` são jsonb: as flags novas e `exposure`/`context`
  não pedem migration.

## Testes

- `test_cnpj_source.py`: firmografias novas extraídas de ambos os provedores.
- `test_website.py`: as três flags de política/termos/CNPJ no rodapé.
- `test_scoring.py`: MEI corta; U de idade; sócios somam; **regressão** — o corte
  duro de situação cadastral continua valendo para tráfego/marketing/design.
- `test_ai_stage.py`: prompt ganha o ângulo com `profession=advocacia`;
  `exposure` e `context` chegam separados no `parse_ai`.
- `test_prompt.py`: brief jurídico presente; e-mail gerado; **e a muralha** — o
  texto não contém nada de `exposure`.
- `test_pricing.py`: faixa de avença por capital/porte, não por avaliações.

## Fora de escopo

- **DataJud (CNJ)**: a API pública é gratuita, mas os metadados não expõem as
  partes — não dá para ligar processo ↔ empresa. Não serve.
- **Protesto (CENPROT/IEPTB)** e **Reclame Aqui**: sem API aberta.
- **Consulta CNA da OAB**: web protegida, e é dado do advogado, não do lead.
- **Envio automático de e-mail.** O humano copia e manda, igual ao WhatsApp.
- **Afinar as outras áreas**: branding, tráfego, automação e design herdam o
  comportamento atual. Zero regressão, mesma estratégia que o marketing usou.

## Nota adjacente (não faz parte deste spec)

`professions.ts` sugere nichos que não existem em `RAMOS_DISPONIVEIS` —
Advocacia, Imobiliária, Startup, Estúdio, Cafeteria, Clínica. Quem marca a área
"Sites/Web" recebe o chip de Advocacia de brinde, mas ninguém consegue
adicioná-lo manualmente nem filtrar por ele em Contatos. Como a seção F já mexe
em `ramos.ts`, o conserto sai quase de graça — mas é bug próprio, com correção
própria.
