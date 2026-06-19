# Garimpo · Extensão (Fase 4)

Card lateral **read-only** sobre o WhatsApp Web. Lê qual conversa está aberta,
casa com o lead no banco e mostra botões de status **contextuais** — atualizar
o funil em 1 clique, sem sair do WhatsApp.

**Nunca envia, nunca injeta texto, nunca raspa contato em massa.** A única
escrita é o status do lead no _nosso_ banco. Risco de ban desprezível: o
WhatsApp fiscaliza envio, não leitura.

## Instalar (modo dev, sem build)

1. Chrome → `chrome://extensions` → ativar **Modo do desenvolvedor**.
2. **Carregar sem compactação** → selecionar a pasta `extension/`.
3. Abrir `web.whatsapp.com`, abrir uma conversa. O card aparece no canto.

Sem configurar nada, roda em **mock** (leads de exemplo). Os telefones do seed
batem com `4499999000X` — útil pra testar o casamento.

## Ligar no Supabase

Página de opções da extensão (`chrome://extensions` → Detalhes → Opções):

- Fonte de dados: **supabase**
- `SUPABASE_URL`, **ANON KEY**
- **ACCESS TOKEN**: o JWT do usuário logado (RLS). Pega da sessão do front
  (a tela de login própria entra numa fase seguinte).

A mudança de status chama a RPC `transition_lead` do banco (valida transição +
guarda LGPD + grava histórico), com `actor = extension`.

## Casamento conversa ↔ lead (o miolo difícil)

O WhatsApp Web nem sempre expõe o número cru no DOM. Estratégia (em
`src/lib/match.mjs`, lógica pura e testada):

1. **Número** quando disponível (prioridade) — normalizado, casa exato.
2. **Nome exibido** como fallback — ignora acento/caixa; se ambíguo, lista os
   candidatos pra você escolher.
3. **Colar número manual** — rede de segurança quando nada casa.

## Estrutura

```
manifest.json            MV3 (content script + options + web_accessible)
src/lib/
  normalize.mjs          telefone (espelha banco)
  state-machine.mjs      transicoes + botoes contextuais (secao 6 do mapa)
  match.mjs              casa conversa <-> lead (numero -> nome -> manual)
  repo.mjs               mock | supabase (REST + RPC transition_lead)
  config.mjs / mock-data.mjs
src/content/
  loader.js              carrega o ESM (padrao MV3)
  main.mjs               le o DOM, casa, renderiza o card, dispara transicoes
  panel.css
src/options/             configuracao (mock/supabase)
tests/                   match + state-machine (node --test, 13 testes)
```

Testes: `npm test` (lógica pura, offline). O DOM do WhatsApp não é testado
aqui — só a lógica de casamento e a máquina de estados.
