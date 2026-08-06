(() => {
  // src/content/wa-open.mjs
  var ORCAMENTO_MS = 8e3;
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
  function camposDeTexto() {
    return Array.from(
      document.querySelectorAll('input:not([type="file"]):not([type="checkbox"]), [contenteditable="true"]')
    );
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
  function botaoNovaConversa() {
    const cands = [
      '[aria-label*="Nova conversa"]',
      '[title*="Nova conversa"]',
      '[aria-label*="New chat"]',
      '[title*="New chat"]',
      'header [data-icon="new-chat-outline"]',
      'header [data-icon="chat"]'
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
  function numeroAtivo() {
    const rotulo = achaComposer()?.getAttribute("aria-label") || "";
    return rotulo.replace(/\D/g, "");
  }
  function mesmoNumero(a, b) {
    const x = String(a).slice(-8);
    const y = String(b).slice(-8);
    return !!x && x === y;
  }
  function fecharPainel() {
    document.body.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", code: "Escape", bubbles: true })
    );
  }
  async function abrirConversa(phone, text) {
    const num = soDigitos(phone);
    if (!num) return false;
    if (mesmoNumero(numeroAtivo(), num)) return preencheSeForOChat(num, text);
    const botao = botaoNovaConversa();
    if (!botao) return false;
    const antes = new Set(camposDeTexto());
    clica(botao);
    const busca = await ateQue(() => {
      const foco = document.activeElement;
      if (foco && foco !== document.body && camposDeTexto().includes(foco)) return foco;
      return camposDeTexto().find((el) => !antes.has(el));
    }, 1200);
    if (!busca) {
      fecharPainel();
      return false;
    }
    digita(busca, num);
    const alvo = await ateQue(() => {
      const casa = (l) => {
        const txt = (l.textContent || "").replace(/\D/g, "");
        return txt && mesmoNumero(txt, num);
      };
      const secao = Array.from(document.querySelectorAll("div, span, h2, h3")).find(
        (e) => /n[aã]o est[aã]o na sua lista|not in your contacts|n[aã]o salvos?/i.test(e.textContent || "")
      );
      if (secao) {
        const perto = Array.from(
          (secao.closest('[role="listitem"], [role="row"], div')?.parentElement || document).querySelectorAll('[role="row"], [role="listitem"], [role="button"]')
        ).find(casa);
        if (perto) return perto;
      }
      return Array.from(
        document.querySelectorAll('[role="row"], [role="listitem"], [role="button"]')
      ).find(casa);
    }, 3500);
    if (!alvo) {
      fecharPainel();
      return false;
    }
    clica(alvo);
    const ok = await ateQue(() => mesmoNumero(numeroAtivo(), num), 1200);
    if (!ok) {
      fecharPainel();
      return false;
    }
    return preencheSeForOChat(num, text);
  }
  async function preencheSeForOChat(num, text) {
    if (!text) return true;
    const comp = await ateQue(achaComposer, 600);
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
        if (!ok) fecharPainel();
        try {
          sendResponse({ ok });
        } catch {
        }
      };
      const guarda = setTimeout(() => {
        responde(mesmoNumero(numeroAtivo(), soDigitos(msg.phone)));
      }, ORCAMENTO_MS);
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
