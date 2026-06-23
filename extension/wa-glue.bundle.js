(() => {
  // src/content/wa-glue.mjs
  (function() {
    function ready() {
      return !!(window.WPP && (window.WPP.isReady || window.WPP.isFullReady));
    }
    try {
      if (window.WPP && window.WPP.webpack && !ready() && window.WPP.webpack.injectLoader) {
        window.WPP.webpack.injectLoader();
      }
    } catch {
    }
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
      }
      return id;
    }
    async function openChat(id) {
      const chat = window.WPP.chat;
      const fn = chat.openChatBottom || chat.openChatAt || chat.openChat;
      if (!fn) throw new Error("sem funcao de abrir chat");
      await fn.call(chat, id);
    }
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
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      return false;
    }
    async function handle(phone, text) {
      if (!await waitReady(5e3)) return false;
      const num = brNumber(phone);
      if (!num) return false;
      const id = await resolveChatId(num);
      await openChat(id);
      if (text && String(text).trim()) prefill(String(text));
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
})();
