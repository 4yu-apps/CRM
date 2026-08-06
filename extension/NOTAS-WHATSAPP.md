# Extensão × WhatsApp Web — o que já custou caro

Notas de campo, escritas depois de uma sequência de erros que o usuário pagou
testando em produção. Leia antes de mexer em `src/background.mjs` ou
`src/content/wa-open.mjs`.

## Regra nº 1: nunca remendar as entranhas do WhatsApp

A extensão usava **wa-js (WPPConnect)**, que injeta na página e remenda os
módulos internos do WhatsApp Web. O WhatsApp mudou os módulos e o remendo
quebrou o **envio de mensagem do próprio usuário** — ele ficou impedido de
mandar mensagem enquanto a extensão estava ativa. Sintoma no console:

```
Module MsgCollection was not found
Module MsgStore was not found
wa-js.bundle.js: Cannot read properties of undefined (reading 'on')
```

Foi removido (`9135b2f`). Não voltar. Além de quebrar, é o vetor que o
WhatsApp **detecta**: as fontes convergem que o que dispara restrição é uso de
API interna (`WPP.helpers.sendMessage`) e padrão de comportamento — não clique
de interface. Em out/2025 a Meta derrubou 131 extensões que abusavam do
WhatsApp Web.

Tudo que a extensão faz hoje é o que uma pessoa faria com o mouse. Quem aperta
enviar continua sendo o humano.

## São DUAS buscas, e só uma serve

Este erro custou três versões:

| busca | onde | serve pra número novo? |
|---|---|---|
| lista de conversas | topo da coluna esquerda | **não** — responde "Nenhuma conversa, contato ou mensagem encontrada" |
| painel "Nova conversa" | abre pelo ✚ no topo | **sim** — é a que aceita número não salvo |

O número não salvo aparece sob a seção **"Não estão na sua lista de contatos"**.
Ressalva: no Desktop/Web esse recurso saiu como beta (Windows 2.2342.6.0), então
pode não existir em todo cliente. Por isso o desenho é sempre *tenta e cai no
reload*, nunca *depende disso*.

## Seletores medidos na tela real (não deduzidos)

Nada de classe ofuscada. O que existe e é estável o bastante:

| o quê | como achar |
|---|---|
| busca do painel | `input[placeholder*="Pesquisar nome"]` |
| composer | `footer div[contenteditable="true"]` ou `[aria-label*="Digite uma mensagem"]` |
| **número da conversa aberta** | o `aria-label` do composer traz: `"Digite uma mensagem para +55 44 9188-4854"` |
| linhas de resultado | `[role="row"]` — `[role="listitem"]` **não existe** mais |

Medição feita no console do usuário: a página inteira tem **um único**
`contenteditable`, que é o composer. A busca é `<input>`.

## Armadilhas que já morderam

**Escrever em campo controlado por React.** Mexer no `.value` direto não avisa o
React. Use o setter nativo do protótipo + evento `input`. Em `contenteditable`,
`insertText` **sobre a seleção** — o `execCommand("delete")` separado não limpava
e o texto ia acumulando (três mensagens grudadas no composer, em produção).

**Escrever no chat errado.** Só preencher o texto depois de confirmar que o
`aria-label` do composer casa com o número pedido. Sem essa checagem, o texto de
vários leads vazou pro composer de outra conversa.

**Clicar na linha errada.** A lista traz outras conversas junto. Só clicar na
linha cujos dígitos casam com o número.

**Painel sobrando.** Se o painel "Nova conversa" fica aberto, o clique seguinte
no ✚ embaralha o estado — o segundo lead quebrava. Se a busca do painel já
existe, o painel está aberto: reaproveite, não clique de novo.

**"Quer sair do site?"** É o WhatsApp avisando que há **rascunho** no composer
quando a aba navega. Como o fallback navega, limpe o rascunho antes de devolver
o controle, senão o diálogo trava tudo e fecha o chat.

**Teto de tempo menor que a soma das esperas.** O teto era 4s e as esperas
internas somavam 6s: ele declarava fracasso *enquanto o fluxo dava certo*, a
conversa abria e o service worker recarregava por cima ("reinicia do nada"). O
teto tem que ser folgado E, antes de desistir, **olhar a tela**: se a conversa
certa já está aberta, foi sucesso.

## Service worker MV3: ele morre no meio

Dois bugs somados faziam a aba do WhatsApp empilhar uma por clique:

- `chrome.storage.session.set` **sem `await`**: a escrita ficava pendente e o
  worker era desligado antes de gravar. No clique seguinte não havia memória da
  aba, e ele abria outra.
- `onMessage` respondendo na hora e retornando `false`: isso diz ao Chrome
  "terminei", liberando ele a matar o worker no meio do `await`. Mantenha o
  canal aberto (`return true`) e responda no fim.

Regra: em MV3, **todo trabalho assíncrono depois de um evento precisa segurar o
canal**, e toda escrita em storage precisa de `await`.

## Achar a aba do WhatsApp: três degraus

`chrome.tabs.query({url})` volta **vazio** quando o acesso ao site está
restrito a "ao clicar", em outro perfil ou em janela anônima — e aí a extensão
criava aba nova a cada clique, sem achar nem a que ela mesma abriu. A busca hoje
tenta, em ordem: filtro por url → varredura de todas as abas → a aba que nós
mesmos abrimos (guardada em `storage.session`).

## Celular

`web.whatsapp.com/send` não serve no celular: o Android intercepta e abre o app,
mas o **iOS mostra "acesse no navegador do seu computador"** e o fluxo morre.
Use `wa.me`, que é universal link nos dois. Está em `front/src/lib/whatsapp.ts`
(`isMobile()`), e o regex precisa incluir `iPad` — o iPadOS moderno também se
disfarça de Macintosh, então tem a checagem de `maxTouchPoints`.

## Como testar sem cobaia humana

Playwright carrega a extensão de verdade em Chromium
(`launchPersistentContext` com `--load-extension`). Dá pra:

- contar abas pelo próprio `chrome.tabs` de dentro do service worker;
- simular a busca por url cega (para reproduzir "acesso restrito");
- montar um DOM com a estrutura do WhatsApp e rodar o algoritmo contra ele,
  inclusive com linha-isca pra pegar clique errado e com atraso pra simular
  WhatsApp lento.

O que **não** dá pra testar sem sessão logada: se os seletores reais batem. Essa
parte só se valida no uso — por isso todo caminho novo precisa cair no reload
quando falha, nunca quebrar.

Cuidado com harness: `chrome.runtime.sendMessage` disparado de dentro do próprio
service worker **não** chega ao `onMessage` dele mesmo. Um teste assim passa
verde sem executar nada. Dispare sempre pelo caminho real (página → bridge → SW).
