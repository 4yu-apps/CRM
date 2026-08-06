(() => {
  // src/content/wa-open.mjs
  var ORCAMENTO_MS = 2500;
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  async function ateQue(fn, ms, passo = 100) {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      try {
        const v = fn();
        if (v) return v;
      } catch {
      }
      await sleep(passo);
    }
    return null;
  }
  function achaBusca() {
    const cands = [
      '#side input[type="text"]',
      '#side input:not([type="file"]):not([type="checkbox"])',
      'input[aria-label*="Pesquis"]',
      'input[aria-label*="Search"]',
      '#side [role="textbox"]',
      '#side [contenteditable="true"]',
      'div[data-tab="3"][contenteditable="true"]'
    ];
    for (const s of cands) {
      const el = document.querySelector(s);
      if (el) return el;
    }
    return null;
  }
  function ehInput(el) {
    return el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement;
  }
  function achaComposer() {
    const cands = [
      'footer div[contenteditable="true"]',
      'div[data-tab="10"][contenteditable="true"]',
      '[aria-label*="Digite uma mensagem"]',
      '[aria-label*="Type a message"]'
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
    return Array.from(pane.querySelectorAll('[role="row"], [role="listitem"]'));
  }
  function digita(el, texto) {
    el.focus();
    if (ehInput(el)) {
      const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(proto.prototype, "value")?.set;
      if (setter) setter.call(el, texto);
      else el.value = texto;
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
      return;
    }
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
    const c = achaComposer();
    const rotulo = c?.getAttribute("aria-label") || "";
    const digitos = rotulo.replace(/\D/g, "");
    if (digitos) return digitos;
    const h = document.querySelector("header [data-id], header [title]");
    return String(h?.getAttribute("data-id") || h?.getAttribute("title") || "").replace(/\D/g, "");
  }
  function soDigitos(p) {
    const d = String(p || "").replace(/\D/g, "");
    if (!d) return "";
    return d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
  }
  async function abrirConversa(phone, text) {
    const num = soDigitos(phone);
    if (!num) return false;
    if (numeroAtivo().endsWith(num.slice(-8))) {
      if (text) await preenche(text);
      return true;
    }
    const busca = achaBusca();
    if (!busca) return false;
    digita(busca, num);
    const item = await ateQue(() => {
      const itens = listaResultados();
      return itens.length ? itens[0] : null;
    }, 1200);
    if (!item) return false;
    const clicavel = item.querySelector('[role="button"], div') || item;
    clicavel.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    clicavel.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    clicavel.click();
    const comp = await ateQue(achaComposer, 1e3);
    if (!comp) return false;
    if (text) await preenche(text);
    return true;
  }
  async function preenche(text) {
    const comp = await ateQue(achaComposer, 600);
    if (!comp) return;
    digita(comp, text);
  }
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
        }
      };
      const guarda = setTimeout(() => responde(false), ORCAMENTO_MS);
      abrirConversa(msg.phone, msg.text).then((ok) => {
        clearTimeout(guarda);
        responde(ok);
      }).catch(() => {
        clearTimeout(guarda);
        responde(false);
      });
      return true;
    });
  }
})();
