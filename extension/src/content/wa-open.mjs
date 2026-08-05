// Abre a conversa DIRIGINDO A INTERFACE do WhatsApp Web, sem reload.
//
// Por que assim: a versao anterior usava wa-js (WPPConnect), que remenda os
// modulos internos do WhatsApp. Quando o WhatsApp mudou os modulos, o remendo
// quebrou o proprio envio de mensagem do usuario. Aqui NAO se toca em nada por
// dentro: digita na busca e clica no resultado, igual a uma pessoa faria.
//
// Roda no mundo ISOLADO (sem acesso ao JS da pagina), o que e o ponto.
//
// Contrato com o service worker: responde {ok:true} so quando a conversa
// ABRIU de verdade. Qualquer outra coisa (seletor mudou, demorou, numero nao
// encontrado) responde {ok:false} DENTRO do orcamento de tempo, e o service
// worker navega a aba como antes. Degradar e o caminho normal, nao excecao.

const ORCAMENTO_MS = 2500; // teto total; acima disso e melhor navegar

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Espera uma condicao virar verdadeira, ou desiste. Nunca lanca.
async function ateQue(fn, ms, passo = 100) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      const v = fn();
      if (v) return v;
    } catch {
      /* DOM em transicao: tenta de novo */
    }
    await sleep(passo);
  }
  return null;
}

// O WhatsApp ofusca as classes, mas mantem alguns atributos estruturais. Varias
// tentativas em ordem: se uma sair do ar, as outras seguram.
function achaBusca() {
  const cands = [
    '#side div[contenteditable="true"]',
    'div[data-tab="3"][contenteditable="true"]',
    '[aria-label*="Pesquis"] [contenteditable="true"]',
    '[aria-label*="Search"] [contenteditable="true"]',
  ];
  for (const s of cands) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

function achaComposer() {
  const cands = [
    'footer div[contenteditable="true"]',
    'div[data-tab="10"][contenteditable="true"]',
    '[aria-label*="Digite uma mensagem"]',
    '[aria-label*="Type a message"]',
  ];
  for (const s of cands) {
    const el = document.querySelector(s);
    if (el) return el;
  }
  return null;
}

function listaResultados() {
  const pane = document.querySelector("#pane-side") || document.querySelector("#side");
  if (!pane) return [];
  return Array.from(pane.querySelectorAll('[role="listitem"], [role="row"]'));
}

// Digita como gente: foca, limpa e usa insertText (o editor do WhatsApp e
// controlado por JS; setar .textContent nao dispara os eventos dele).
function digita(el, texto) {
  el.focus();
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("delete");
  document.execCommand("insertText", false, texto);
  el.dispatchEvent(new InputEvent("input", { bubbles: true, data: texto, inputType: "insertText" }));
}

function numeroAtivo() {
  // O cabecalho da conversa aberta guarda o numero/jid em algum atributo.
  const h = document.querySelector("header [data-id], header [title]");
  const bruto = h?.getAttribute("data-id") || h?.getAttribute("title") || "";
  return String(bruto).replace(/\D/g, "");
}

function soDigitos(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
}

async function abrirConversa(phone, text) {
  const num = soDigitos(phone);
  if (!num) return false;

  // Ja esta na conversa certa? entao so preenche o texto.
  if (numeroAtivo().endsWith(num.slice(-8))) {
    if (text) await preenche(text);
    return true;
  }

  const busca = achaBusca();
  if (!busca) return false;

  digita(busca, num);

  // Espera aparecer algum resultado clicavel.
  const item = await ateQue(() => {
    const itens = listaResultados();
    return itens.length ? itens[0] : null;
  }, 1200);
  if (!item) return false;

  const clicavel = item.querySelector('[role="button"], div') || item;
  clicavel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  clicavel.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
  clicavel.click();

  // So conta como sucesso se o composer aparecer (conversa realmente aberta).
  const comp = await ateQue(achaComposer, 1000);
  if (!comp) return false;

  if (text) await preenche(text);
  return true;
}

async function preenche(text) {
  const comp = await ateQue(achaComposer, 600);
  if (!comp) return;
  digita(comp, text);
}

// Guarda contra reinjecao (o background reinjeta ao recarregar a extensao).
if (!window.__garimpoWaOpen) {
  window.__garimpoWaOpen = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "garimpo_switch_chat") return;
    let respondido = false;
    const responde = (ok) => {
      if (respondido) return;
      respondido = true;
      try {
        sendResponse({ ok });
      } catch {
        /* canal fechado: o service worker ja seguiu pro fallback */
      }
    };
    // Teto duro: passou do orcamento, deixa o service worker navegar.
    const guarda = setTimeout(() => responde(false), ORCAMENTO_MS);
    abrirConversa(msg.phone, msg.text)
      .then((ok) => {
        clearTimeout(guarda);
        responde(ok);
      })
      .catch(() => {
        clearTimeout(guarda);
        responde(false);
      });
    return true; // resposta assincrona
  });
}
