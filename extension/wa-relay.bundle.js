(() => {
  // src/content/wa-relay.mjs
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (!msg || msg.type !== "garimpo_switch_chat") return;
    const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMsg = (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== "garimpo-page" || d.type !== "open_result" || d.reqId !== reqId) return;
      cleanup();
      sendResponse({ ok: !!d.ok });
    };
    const to = setTimeout(() => {
      cleanup();
      sendResponse({ ok: false });
    }, 1e4);
    function cleanup() {
      clearTimeout(to);
      window.removeEventListener("message", onMsg);
    }
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "garimpo-sw", type: "open_chat", phone: msg.phone, text: msg.text, reqId }, "*");
    return true;
  });
})();
