<p align="center">
  <img src="logotipo4yumkt.png" alt="4YUmkt" width="340">
</p>

<h1 align="center">CRM | 4YUmkt</h1>

<p align="center">
  <strong>Garimpo</strong>, prospeccao assistida por IA, barata e com humano no loop.<br>
  A IA encontra, enriquece, pontua e rascunha. O humano aprova e envia. Nunca o contrario.
</p>

<p align="center">
  No ar em <a href="https://crm.4yumkt.com.br"><strong>crm.4yumkt.com.br</strong></a>
</p>

---

## O que e, em uma frase

Um sistema que faz o trabalho bracal da prospeccao (achar, completar, filtrar,
escrever e organizar os leads) e devolve ao usuario so o que depende de gente:
**decidir** (aprovar ou descartar) e **conversar** (fechar o cliente). Tudo
barato, sem ferramenta paga onde script resolve, e sem nenhum envio automatico.
Codinome interno: **Garimpo**.

## Para quem (a visao em duas fases)

**Fase 1 (agora):** o cliente e o Eduardo (4YUmkt). Objetivo unico: ele prospectar
de forma facil e automatica. A casa e construida focada nele.

**Fase 2 (projetada desde ja, na arquitetura):** virar produto por assinatura para
freelancers que querem prospectar para os proprios clientes, em varios verticais
(gestao de trafego, automacao, design, marketing, e o que vier). Cada usuario tem
o proprio login, perfil e configuracao. No onboarding, a pessoa responde para que
quer o sistema e quais nichos atua, e isso define o nicho buscado, os criterios de
qualificacao, a copy e a sugestao de preco. Exemplo de como o vertical muda o
criterio: sem site e otimo para designer; nao anuncia e otimo para trafego; sem
rede social e otimo para marketing.

> A Fase 1 nao constroi a Fase 2, mas mantem as costuras prontas (config por
> usuario, login, esteira multi-usuario) para o salto sair barato.

## Como funciona (o fluxo)

```
FONTES (Google Maps, CNPJ publico, Instagram, site, Meta Ad Library)
   |
   v
1. DESCOBERTA   Google Places API, no servidor (cron). status: bruto
   |
   v
2. ENRIQUECIMENTO   cascata Python (CNPJ, site, IG, anuncios). status: enriquecido
   |
   v
3. SCORE/QUALIFICACAO   regras puras do ICP, por servico. status: qualificado ou descartado
   |
   v
4. RASCUNHO   IA escreve as 2 mensagens. status: rascunho_pronto
   |
   v
=== PORTAO HUMANO (zero automacao) ===
5. APROVACAO   humano revisa no CRM. status: aprovado
6. ENVIO   humano dispara no WhatsApp, com a propria mao. status: enviado
   |
   v
7. ACOMPANHAMENTO   extensao read-only no WhatsApp, status em 1 clique
8. DASHBOARD   funil, conversao, meta de receita
```

Leitura em uma frase: as fontes alimentam a descoberta, o Supabase e a espinha por
onde tudo passa, o Python enriquece e pontua, a IA rascunha, **o humano aprova e
envia**, a extensao acompanha a conversa e o dashboard mede.

## A descoberta e online por padrao

A forma **oficial** de descobrir leads e a **Google Places API**, rodando sozinha
no servidor (GitHub Actions cron). O usuario nao precisa do PC ligado: sai de
casa, volta e a fila esta cheia. No volume de prospeccao, fica dentro da cota
gratis do Google (custo perto de R$0), com teto de seguranca configurado para
nunca haver surpresa na fatura.

A captacao pela **extensao do navegador** (varredura do Google Maps) continua no
codigo, porem em **standby**: e um segundo caminho, nao o padrao. A extensao tem
um papel ativo separado, o **acompanhamento no WhatsApp Web** (marcar respondeu,
reuniao, fechou), onde ela e read-only e o risco de ban e desprezivel.

## Localizacao inteligente (no radar)

Prospeccao comeca por lugar, entao a localizacao precisa ser solida: **estado**
primeiro, depois **cidade** (de uma lista oficial, sem ambiguidade entre cidades
de mesmo nome), e a **regiao** o sistema cobre sozinho por grade, mostrando no
mapa o que ja foi varrido. O usuario nao precisa conhecer os bairros de uma cidade
nova; a maquina varre em ordem e nunca repete zona. Detalhe do plano na memoria do
projeto.

## Monorepo

| Pasta        | Peca                                                        | Estado |
|--------------|-------------------------------------------------------------|--------|
| `supabase/`  | Banco (Postgres): leads, proveniencia, historico, RLS       | no ar  |
| `front/`     | CRM Next.js + shadcn (Base UI) + Tailwind, deploy na Vercel | no ar  |
| `esteira/`   | Cascata Python: descobre, enriquece, pontua, rascunha       | no ar  |
| `extension/` | Chrome MV3 read-only (WhatsApp Web) + captacao Maps standby | funciona |

Cada peca e **offline-first**: roda sem infra (mock, fixture) e liga no Supabase
trocando variaveis de ambiente. Veja o README de cada pasta.

## Maquina de estados do lead

```
bruto -> enriquecido -> qualificado -> rascunho_pronto -> aprovado -> enviado
              | descartado                                     |
                            respondeu <-> sem_resposta (follow-up)
                            | interessado -> reuniao -> proposta -> fechado / perdido
                            | sem_interesse
```

Mudanca de status sempre pela RPC `transition_lead` (valida a transicao, aplica a
guarda LGPD e grava o historico). A maquina vive em tres lugares espelhados: o
banco (fonte da verdade), `front/src/lib/state-machine.ts` e
`extension/src/lib/state-machine.mjs`.

## Os 2 servicos (trafego x automacao x ambos)

O usuario vende dois produtos, e um lead pode servir para um, para o outro ou para
os dois. O score roda **dois ICPs** (`trafego` e `automacao`), decide o
`service_target` e explica o motivo em portugues. A copy muda por servico. Esse
modelo de dois servicos e o caso particular que, na Fase 2, vira o conceito geral
de **vertical do usuario**.

## Stack e custo

Supabase (Postgres, Auth, RLS) + GitHub Actions (cron gratis) + Vercel (hobby) +
Gemini free tier no runtime + Google Places dentro da cota gratis. Meta:
**menos de R$30/mes**.

## Rodar e verificar (offline, sem banco)

```bash
# schema (valida as migrations num Postgres embutido, sem docker)
npm install && npm run db:validate

# esteira (pipeline com fixtures + copy mock)
cd esteira && python3 -m venv .venv && . .venv/bin/activate && pip install -e ".[dev]"
python -m pytest

# front (modo mock)
cd front && npm install && npm run dev   # localhost:3000 ; npm run lint ; npm run build

# extensao (logica pura)
cd extension && node --test
```

Para ligar no Supabase real, veja o `.env.example` de cada pasta. Segredos so em
`.env` / `.env.local` (gitignored). **O repositorio e PUBLICO: nunca commite
chave.**

## Convencoes

- Offline-first em tudo novo (padrao repo/sink: interface + mock + supabase).
- Status so via `transition_lead`. Espelhar a maquina de estados nos tres lugares.
- Migrations append-only, numeradas, com `npm run db:validate` atualizado.
- Commits em pt-BR, curtos, com trailer de co-autoria.
- **Zero travessoes e zero cara de IA** em copy, UI, prompt, commit e doc. Voz
  humana. Ver `GUIA-COPY-HUMANA.md`.

## Documentos de apoio

- `garimpo-mapa-do-projeto.md`, o mapa estrategico (a constituicao do projeto).
- `PLANO-DE-EXECUCAO.md`, o plano de construcao pagina a pagina.
- `HANDOFF.md` e `PROXIMOS-PASSOS.md`, estado e de onde retomar.
- `GUIA-COPY-HUMANA.md`, as regras da mensagem de prospeccao.
