// Roda no MUNDO DA PAGINA (world: MAIN) junto com o wa-js (WPP), que da acesso a
// API interna do WhatsApp Web. Abre/troca a conversa SEM reload (ate pra numero
// novo) e pre-preenche o texto, sem enviar. Se NAO conseguir nem ABRIR a conversa,
// responde ok:false e o background cai no fallback (navegar a aba = reload). O
// prefill do texto e best-effort: se a conversa abriu sem reload, isso JA e o
// sucesso — nao vale recarregar so pra inserir o rascunho. Nunca aperta enviar.

(function () {
  function ready() {
    return !!(window.WPP && (window.WPP.isReady || window.WPP.isFullReady));
  }

  // wa-js normalmente auto-injeta; garante o loader caso ainda nao esteja pronto.
  try {
    if (window.WPP && window.WPP.webpack && !ready() && window.WPP.webpack.injectLoader) {
      window.WPP.webpack.injectLoader();
    }
  } catch {
    /* ignora */
  }

  // Espera o WPP ficar pronto (ate `ms`). No clique o usuario pode disparar antes
  // do WhatsApp Web terminar de subir; em vez de desistir na hora (= reload), da
  // um tempo. Fica abaixo do timeout do relay pra ele ainda receber a resposta.
  function waitReady(ms) {
    if (ready()) return Promise.resolve(true);
    return new Promise((resolve) => {
      let done = false;
      const finish = (v) => {
        if (done) return;
        done = true;
        clearInterval(iv);
        clearTimeout(to);
        resolve(v);
      };
      const iv = setInterval(() => {
        if (ready()) finish(true);
      }, 150);
      const to = setTimeout(() => finish(ready()), ms);
    });
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

  // Numero (so digitos) da conversa aberta agora, pra confirmar se o open pegou.
  function activeNum() {
    try {
      const ac = window.WPP.chat.getActiveChat && window.WPP.chat.getActiveChat();
      const u = ac && ac.id && (ac.id.user || String(ac.id._serialized || "").split("@")[0]);
      return u ? String(u).replace(/\D/g, "") : null;
    } catch {
      return null;
    }
  }

  // Conversa aberta bate com o numero pedido? (compara os ultimos 8 digitos: o
  // numero local BR, suficiente pra nao confundir conversas e robusto ao lid.)
  function opened(num) {
    const a = activeNum();
    if (!a) return false;
    const tail = String(num).slice(-8);
    return a.endsWith(tail);
  }

  function waitOpened(num, ms) {
    if (opened(num)) return Promise.resolve(true);
    return new Promise((resolve) => {
      const t0 = Date.now();
      const iv = setInterval(() => {
        if (opened(num) || Date.now() - t0 > ms) {
          clearInterval(iv);
          resolve(opened(num));
        }
      }, 120);
    });
  }

  // Abre a conversa SEM reload, resiliente ao "findOrCreateLatestChat lid_not_found"
  // (numero novo cujo @c.us o WhatsApp nao mapeia pro lid). Materializa o chat antes
  // (chat.find resolve o lid), tenta as variantes de abrir, e CONFIRMA pelo chat ativo:
  // se a conversa abriu de fato, e sucesso mesmo que a promise tenha rejeitado — assim
  // o erro interno do WhatsApp nao dispara um reload a toa.
  async function openChat(id, num) {
    const chat = window.WPP.chat;
    try {
      if (chat.find) await chat.find(id);
    } catch {
      /* find best-effort: resolve o lid quando da, mas nao bloqueia */
    }
    const fns = [chat.openChatBottom, chat.openChatAt, chat.openChat].filter(Boolean);
    if (!fns.length) throw new Error("sem funcao de abrir chat");
    let lastErr;
    for (const fn of fns) {
      try {
        await fn.call(chat, id);
        return true;
      } catch (e) {
        lastErr = e;
        // a promise pode rejeitar (lid_not_found) DEPOIS de ja ter trocado a conversa
        if (await waitOpened(num, 700)) return true;
      }
    }
    // ultima confirmacao: abriu apesar do erro?
    if (await waitOpened(num, 1200)) return true;
    throw lastErr || new Error("nao abriu");
  }

  // Pre-preenche a caixa de mensagem (footer) sem enviar. execCommand dispara os
  // eventos que o WhatsApp escuta pra registrar o rascunho. NUNCA da Enter.
  // Best-effort com algumas tentativas: o footer pode demorar a renderizar depois
  // de trocar de conversa (numero novo, lista grande, etc.).
  async function prefill(text) {
    for (let i = 0; i < 12; i++) {
      const box = document.querySelector('footer div[contenteditable="true"]');
      if (box) {
        try {
          box.focus();
          const sel = window.getSelection();
          sel.removeAllRanges();
          const range = document.createRange();
          range.selectNodeContents(box);
          sel.addRange(range);
          document.execCommand("insertText", false, text);
          if (box.textContent && box.textContent.length > 0) return true;
        } catch {
          /* tenta de novo */
        }
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    return false;
  }

  // Veredito de existencia no WhatsApp. has = tem, none = nao tem (resolveu limpo),
  // unknown = nao deu pra saber (erro/sessao). NUNCA arquiva no unknown.
  async function checkWhatsapp(num) {
    try {
      if (!window.WPP?.contact?.queryExists) return "unknown";
      const r = await window.WPP.contact.queryExists(num);
      if (r && r.wid) return "has";
      return "none"; // resolveu sem wid = numero nao existe no WhatsApp
    } catch {
      return "unknown";
    }
  }

  async function handle(phone, text) {
    if (!(await waitReady(5000))) return false; // WPP nao subiu a tempo -> fallback
    const num = brNumber(phone);
    if (!num) return false;
    if ((await checkWhatsapp(num)) === "none") {
      window.postMessage({ source: "garimpo-page", type: "no_whatsapp", phone }, "*");
      return false; // nao abre conversa pra numero sem WhatsApp
    }
    const id = await resolveChatId(num);
    await openChat(id, num);
    // Conversa aberta = sucesso. Responde JA (nao segura o ack ate o prefill, senao
    // o relay/background podem dar timeout e recarregar mesmo com a conversa aberta).
    // O prefill roda em segundo plano e e best-effort (nao recarrega se falhar).
    if (text && String(text).trim()) prefill(String(text));
    return true;
  }

  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "garimpo-sw") return;

    if (d.type === "check_whatsapp") {
      let verdict = "unknown";
      try {
        const num = brNumber(d.phone);
        verdict = num ? await checkWhatsapp(num) : "unknown";
      } catch {
        verdict = "unknown";
      }
      window.postMessage({ source: "garimpo-page", type: "check_result", verdict, reqId: d.reqId }, "*");
      return;
    }

    if (d.type === "open_chat") {
      let ok = false;
      try {
        ok = await handle(d.phone, d.text);
      } catch {
        ok = false;
      }
      window.postMessage({ source: "garimpo-page", type: "open_result", ok, reqId: d.reqId }, "*");
      return;
    }

    if (d.type === "prefill") {
      let ok = false;
      try {
        ok = await prefill(String(d.text || ""));
      } catch {
        ok = false;
      }
      window.postMessage({ source: "garimpo-page", type: "prefill_result", ok, reqId: d.reqId }, "*");
      return;
    }
  });
})();
