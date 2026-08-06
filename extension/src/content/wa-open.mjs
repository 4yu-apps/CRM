// Abre a conversa pelo fluxo "NOVA CONVERSA" do WhatsApp Web, sem reload.
//
// Historia curta, pra ninguem repetir:
//  1) wa-js (WPPConnect) remendava os modulos internos do WhatsApp. O WhatsApp
//     mudou, o remendo quebrou o envio do proprio usuario. Removido.
//  2) Digitar na busca da LISTA DE CONVERSAS nao serve: medido na tela real,
//     ela responde "Nenhuma conversa, contato ou mensagem encontrada" pra
//     numero novo. Ela so varre o que ja existe.
//  3) Este arquivo: o botao "Nova conversa" (o + no topo) abre OUTRA busca, e
//     e essa que aceita numero nao salvo. E o mesmo caminho que a pessoa faz
//     na mao, sem tocar em nada por dentro do WhatsApp.
//
// Contrato: responde {ok:true} SO quando a conversa do numero pedido esta
// aberta de verdade (confirmado pelo rotulo do composer). Qualquer outra coisa
// responde {ok:false} dentro do orcamento, desfaz o que abriu (Esc) e o service
// worker navega como antes. Degradar limpo e parte do projeto.

const ORCAMENTO_MS = 4000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ateQue(fn, ms, passo = 100) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    try {
      const v = fn();
      if (v) return v;
    } catch {
      /* DOM em transicao */
    }
    await sleep(passo);
  }
  return null;
}

// Todo campo de texto da pagina (input ou contenteditable). Usado pra descobrir
// a busca do "Nova conversa" por DIFERENCA: a que aparecer depois do clique e
// ela — assim nao dependo de classe ofuscada nem de data-tab, que mudam.
function camposDeTexto() {
  return Array.from(
    document.querySelectorAll('input:not([type="file"]):not([type="checkbox"]), [contenteditable="true"]'),
  );
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

function botaoNovaConversa() {
  const cands = [
    '[aria-label*="Nova conversa"]',
    '[title*="Nova conversa"]',
    '[aria-label*="New chat"]',
    '[title*="New chat"]',
    'header [data-icon="new-chat-outline"]',
    'header [data-icon="chat"]',
  ];
  for (const s of cands) {
    const el = document.querySelector(s);
    if (el) return el.closest("button, [role=button], div") || el;
  }
  return null;
}

function ehInput(el) {
  return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
}

// Escreve num campo controlado por React/editor rico. Em input, o setter do
// prototipo (senao o React ignora). Em contenteditable, seleciona tudo e usa
// insertText, que SUBSTITUI a selecao — sem delete separado, que no editor do
// WhatsApp deixava o texto anterior e ia acumulando.
function digita(el, texto) {
  el.focus();
  if (ehInput(el)) {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
    if (setter) setter.call(el, texto);
    else el.value = texto;
    el.dispatchEvent(new Event("input", { bubbles: true }));
    return;
  }
  const sel = window.getSelection();
  const range = document.createRange();
  range.selectNodeContents(el);
  sel.removeAllRanges();
  sel.addRange(range);
  document.execCommand("insertText", false, texto);
}

function clica(el) {
  for (const tipo of ["pointerdown", "mousedown", "pointerup", "mouseup", "click"]) {
    el.dispatchEvent(new MouseEvent(tipo, { bubbles: true, cancelable: true, view: window }));
  }
}

function soDigitos(p) {
  const d = String(p || "").replace(/\D/g, "");
  if (!d) return "";
  return d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
}

// Numero da conversa ABERTA: vem do proprio rotulo do composer, medido na tela
// real ("Digite uma mensagem para +55 44 9188-4854").
function numeroAtivo() {
  const rotulo = achaComposer()?.getAttribute("aria-label") || "";
  return rotulo.replace(/\D/g, "");
}

// Comparar por sufixo evita tropecar no 9 extra e no codigo do pais.
function mesmoNumero(a, b) {
  const x = String(a).slice(-8);
  const y = String(b).slice(-8);
  return !!x && x === y;
}

function fecharPainel() {
  document.body.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true }),
  );
}

async function abrirConversa(phone, text) {
  const num = soDigitos(phone);
  if (!num) return false;

  // Ja esta na conversa certa: nao precisa abrir nada.
  if (mesmoNumero(numeroAtivo(), num)) return preencheSeForOChat(num, text);

  const botao = botaoNovaConversa();
  if (!botao) return false;

  const antes = new Set(camposDeTexto());
  clica(botao);

  // O painel FOCA a busca ao abrir. O activeElement e a pista mais confiavel;
  // a diferenca de campos fica de reserva (caso o WhatsApp reuse o mesmo campo
  // e o foco nao venha).
  const busca = await ateQue(() => {
    const foco = document.activeElement;
    if (foco && foco !== document.body && camposDeTexto().includes(foco)) return foco;
    return camposDeTexto().find((el) => !antes.has(el));
  }, 1500);
  if (!busca) {
    fecharPainel();
    return false;
  }

  digita(busca, num);

  // Espera uma linha de resultado que contenha os digitos do numero. Sem isso,
  // clicar no primeiro item abriria a conversa ERRADA.
  const alvo = await ateQue(() => {
    const casa = (l) => {
      const txt = (l.textContent || "").replace(/\D/g, "");
      return txt && mesmoNumero(txt, num);
    };
    // O numero nao salvo aparece sob um cabecalho proprio ("Nao estao na sua
    // lista de contatos"). Se ele existir, prioriza o que vem depois dele.
    const secao = Array.from(document.querySelectorAll("div, span, h2, h3")).find((e) =>
      /n[aã]o est[aã]o na sua lista|not in your contacts|n[aã]o salvos?/i.test(e.textContent || ""),
    );
    if (secao) {
      const perto = Array.from(
        (secao.closest('[role="listitem"], [role="row"], div')?.parentElement || document)
          .querySelectorAll('[role="row"], [role="listitem"], [role="button"]'),
      ).find(casa);
      if (perto) return perto;
    }
    return Array.from(
      document.querySelectorAll('[role="row"], [role="listitem"], [role="button"]'),
    ).find(casa);
  }, 2200);

  if (!alvo) {
    fecharPainel();
    return false;
  }

  clica(alvo);

  // So e sucesso se o composer da conversa CERTA aparecer.
  const ok = await ateQue(() => mesmoNumero(numeroAtivo(), num), 1500);
  if (!ok) {
    fecharPainel();
    return false;
  }
  return preencheSeForOChat(num, text);
}

// Preenche o texto SO se a conversa aberta for mesmo a do numero pedido. Foi a
// falta dessa checagem que fez o texto de varios leads se acumular no composer
// de outra conversa.
async function preencheSeForOChat(num, text) {
  if (!text) return true;
  const comp = await ateQue(achaComposer, 800);
  if (!comp) return false;
  if (!mesmoNumero(numeroAtivo(), num)) return false;
  digita(comp, text);
  return true;
}

if (!window.__garimpoWaOpen) {
  window.__garimpoWaOpen = true;
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "garimpo_switch_chat") return;
    let respondido = false;
    const responde = (ok) => {
      if (respondido) return;
      respondido = true;
      if (!ok) fecharPainel(); // nunca deixa painel/busca abertos na tela
      try {
        sendResponse({ ok });
      } catch {
        /* canal fechado: o service worker ja navegou */
      }
    };
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
    return true;
  });
}
