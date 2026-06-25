# Detecção da extensão + badge proativo no CRM

Data: 2026-06-25
Frente: 1 de 3 (extensão). As outras duas — conta do usuário e pesquisa de oportunidades — têm specs próprios.

## Problema

A extensão de Chrome acelera muito a prospecção (WhatsApp Web sem reload, captura no Maps, controle de funil). Hoje o CRM não avisa quem ainda não instalou. O passo a passo de instalação existe, mas escondido dentro de `/config` — o usuário só acha se for procurar. Resultado: gente operando sem a ferramenta que mais dá velocidade.

## Objetivo

O CRM detecta sozinho se a extensão está presente e, quando falta, mostra um aviso amigável e não-intrusivo que destaca o valor e leva à instalação em poucos cliques. Quando está presente, confirma de forma discreta.

## O que já existe (reuso)

- `extension/src/content/crm-bridge.mjs` injeta na página do CRM e já seta `data-garimpo-ext="1"` no `<html>` e posta `window.postMessage({ source: "garimpo-ext", type: "ready" })`.
- `front/src/lib/whatsapp.ts` já lê `data-garimpo-ext` para delegar o "abrir WhatsApp" à extensão.
- `front/public/4yu-crm-extension.zip` já é o pacote distribuível.
- `front/src/app/(app)/config/page.tsx` (Section "Extensão Chrome") já tem o passo a passo + botão de download.

A detecção, portanto, já está ~90% pronta. O trabalho é de superfície (UI) + consolidação (componente compartilhado) + robustez do pacote (script de zip).

## Arquitetura

Três peças, cada uma com responsabilidade única:

### 1. Sinal da extensão (camada extensão)

`crm-bridge.mjs` passa a postar também a versão do manifest junto do `ready`:

```
window.postMessage({ source: "garimpo-ext", type: "ready", version: chrome.runtime.getManifest().version }, "*");
```

E grava a versão num atributo: `document.documentElement.setAttribute("data-garimpo-ext-version", version)`. Presença continua sinalizada por `data-garimpo-ext="1"` (não muda o contrato existente do whatsapp.ts).

v1 consome só a presença. A versão fica disponível no sinal para um futuro nudge de "atualize a extensão" — sem custo adicional agora.

### 2. Hook de detecção (camada front, lib)

`front/src/lib/use-extension.ts` — hook `useExtension()`:

- Estado: `{ installed: boolean | null, version: string | null }`. `null` = ainda verificando.
- No mount: lê `data-garimpo-ext` / `data-garimpo-ext-version`. Se presente, `installed=true`.
- Escuta `window.message` por `{ source: "garimpo-ext", type: "ready" }` — cobre a extensão que injeta depois do primeiro paint do React.
- Timeout de ~1.2s sem sinal → `installed=false`.
- `recheck()` exposto (botão "já instalei" no popover força nova leitura).
- Cleanup do listener e do timeout no unmount.

Único ponto de verdade sobre presença da extensão no front. `whatsapp.ts` pode passar a usar o hook depois (não obrigatório nesta frente).

### 3. UI (camada front, componentes)

**`<ExtensionInstall />`** — `front/src/components/extension-install.tsx`. Bloco reutilizável extraído do `/config`: copy de valor, os 3 passos (Baixar e descompactar / Abrir chrome://extensions / Carregar a pasta) e o botão "Baixar extensão" apontando para `/4yu-crm-extension.zip`. O `/config` passa a renderizar este componente (zero copy duplicada).

**`<ExtensionBadge />`** — `front/src/components/extension-badge.tsx`. Ancorado no topbar do `app-shell.tsx`, perto do avatar. Comportamento por estado:

- `installed === null`: renderiza nada (não pisca durante a checagem).
- `installed === false`: pontinho âmbar discreto + ícone de peça (Puzzle). Clique abre um Popover com `<ExtensionInstall />` resumido + link "já instalei" que chama `recheck()`. Botão "não mostrar de novo" grava `localStorage` (`garimpo:ext-badge-dismissed`) → o badge para de chamar atenção (sem pulsar) mas continua clicável.
- `installed === true`: vira um check discreto (ícone pequeno de "conectada"), sem popover de instalação — no máximo um tooltip "Extensão conectada".

### 4. Pacote sempre atualizado (camada extensão, build)

Novo script `npm run zip` no `extension/package.json`: roda o `build` e empacota os bundles + `manifest.json` + `icons/` + `src/` necessários num zip escrito direto em `front/public/4yu-crm-extension.zip`. Garante que o download nunca fica defasado vs o código. Documentar no README da extensão que `zip` deve rodar antes de subir front.

## Fluxo de dados

1. Página do CRM carrega → React monta → `useExtension()` começa a checar.
2. Se a extensão está ativa, `crm-bridge.mjs` já setou o atributo (e/ou posta `ready`) → `installed=true` → badge vira check.
3. Sem sinal em ~1.2s → `installed=false` → badge âmbar.
4. Usuário clica → popover → baixa zip → instala → recarrega/clica "já instalei" → `recheck()` → `installed=true`.

## Erros e bordas

- Extensão recarregada sem recarregar a aba (content script órfão): o atributo do paint anterior pode persistir; aceitável — `recheck()` e reload resolvem. Não é caso a otimizar.
- `localStorage` indisponível (modo privado): dismiss falha silenciosamente, badge continua funcional.
- Modo mock (sem Supabase): badge funciona igual — depende só do sinal da extensão, não do auth.

## Testes

- Extensão: teste unitário do `crm-bridge` confirmando que posta `version` e seta os dois atributos (segue o padrão `node --test` já existente).
- Front: o hook é client-only e dependente de DOM/postMessage; cobrir o núcleo testável (timeout → false; atributo presente → true; `recheck` relê). Sem encher de teste de UI — verificar o badge nos 3 estados via inspeção/preview, não suíte pesada.

## Fora de escopo (YAGNI nesta frente)

- Auto-update real da extensão.
- Telemetria/contagem de quantos instalaram.
- Detecção server-side (impossível: sinal é client-only).
- Nudge de "atualize a versão" (o sinal já carrega a versão, mas o nudge fica para depois).

## Arquivos tocados

- `extension/src/content/crm-bridge.mjs` (posta versão + atributo)
- `extension/package.json` (script `zip`)
- `extension/README.md` (doc do `zip`)
- `front/src/lib/use-extension.ts` (novo)
- `front/src/components/extension-install.tsx` (novo, extraído do config)
- `front/src/components/extension-badge.tsx` (novo)
- `front/src/components/app-shell.tsx` (monta o badge no topbar)
- `front/src/app/(app)/config/page.tsx` (passa a usar `<ExtensionInstall/>`)
