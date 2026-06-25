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
    function activeNum() {
      try {
        const ac = window.WPP.chat.getActiveChat && window.WPP.chat.getActiveChat();
        const u = ac && ac.id && (ac.id.user || String(ac.id._serialized || "").split("@")[0]);
        return u ? String(u).replace(/\D/g, "") : null;
      } catch {
        return null;
      }
    }
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
    async function openChat(id, num) {
      const chat = window.WPP.chat;
      try {
        if (chat.find) await chat.find(id);
      } catch {
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
          if (await waitOpened(num, 700)) return true;
        }
      }
      if (await waitOpened(num, 1200)) return true;
      throw lastErr || new Error("nao abriu");
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
    async function checkWhatsapp(num) {
      try {
        if (!window.WPP?.contact?.queryExists) return "unknown";
        const r = await window.WPP.contact.queryExists(num);
        if (r && r.wid) return "has";
        return "none";
      } catch {
        return "unknown";
      }
    }
    async function handle(phone, text) {
      if (!await waitReady(5e3)) return false;
      const num = brNumber(phone);
      if (!num) return false;
      if (await checkWhatsapp(num) === "none") {
        window.postMessage({ source: "garimpo-page", type: "no_whatsapp", phone }, "*");
        return false;
      }
      const id = await resolveChatId(num);
      await openChat(id, num);
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
})();
