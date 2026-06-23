// Roda no MUNDO DA PAGINA (world: MAIN) junto com o wa-js (WPP), que da acesso a
// API interna do WhatsApp Web. Abre/troca a conversa SEM reload (ate pra numero
// novo) e pre-preenche o texto, sem enviar. Se algo falhar, responde ok:false e
// o background cai no fallback (navegar a aba = reload). Nunca aperta enviar.

(function () {
  function ready() {
    return !!(window.WPP && window.WPP.isReady);
  }

  // wa-js normalmente auto-injeta; garante o loader caso ainda nao esteja pronto.
  try {
    if (window.WPP && window.WPP.webpack && !window.WPP.isReady && window.WPP.webpack.injectLoader) {
      window.WPP.webpack.injectLoader();
    }
  } catch {
    /* ignora */
  }

  function brNumber(phone) {
    const d = String(phone || "").replace(/\D/g, "");
    if (!d) return null;
    return d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
  }

  async function resolveChatId(num) {
    let id = `${num}@c.us`;
    try {
      const r = await window.WPP.contact.queryExists(num);
      if (r && r.wid) id = r.wid._serialized || (r.wid.user ? `${r.wid.user}@c.us` : id);
    } catch {
      /* sem queryExists: usa o id padrao */
    }
    return id;
  }

  async function openChat(id) {
    const chat = window.WPP.chat;
    const fn = chat.openChatBottom || chat.openChatAt || chat.openChat;
    if (!fn) throw new Error("sem funcao de abrir chat");
    await fn.call(chat, id);
  }

  // Pre-preenche a caixa de mensagem (footer) sem enviar. execCommand dispara os
  // eventos que o WhatsApp escuta pra registrar o rascunho. NUNCA da Enter.
  function prefill(text) {
    const box = document.querySelector('footer div[contenteditable="true"]');
    if (!box) return false;
    try {
      box.focus();
      const sel = window.getSelection();
      sel.removeAllRanges();
      const range = document.createRange();
      range.selectNodeContents(box);
      sel.addRange(range);
      document.execCommand("insertText", false, text);
      return !!(box.textContent && box.textContent.length > 0);
    } catch {
      return false;
    }
  }

  async function handle(phone, text) {
    if (!ready()) return false;
    const num = brNumber(phone);
    if (!num) return false;
    const id = await resolveChatId(num);
    await openChat(id);
    if (text && String(text).trim()) {
      // da um tempo pro footer renderizar antes de preencher
      await new Promise((r) => setTimeout(r, 350));
      if (!prefill(String(text))) return false; // sem prefill: deixa o fallback cuidar
    }
    return true;
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "garimpo-sw" || d.type !== "open_chat") return;
    let ok = false;
    try {
      ok = await handle(d.phone, d.text);
    } catch {
      ok = false;
    }
    window.postMessage({ source: "garimpo-page", type: "open_result", ok, reqId: d.reqId }, "*");
  });
})();
