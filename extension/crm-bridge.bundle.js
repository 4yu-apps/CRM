(() => {
  // src/content/crm-bridge.mjs
  var extVersion = (() => {
    try {
      return chrome.runtime.getManifest().version;
    } catch {
      return "";
    }
  })();
  document.documentElement.setAttribute("data-garimpo-ext", "1");
  if (extVersion) document.documentElement.setAttribute("data-garimpo-ext-version", extVersion);
  window.postMessage({ source: "garimpo-ext", type: "ready", version: extVersion }, "*");
  if (!window.__garimpoCrmBridge) {
    window.__garimpoCrmBridge = true;
    window.addEventListener("message", (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== "garimpo-crm" || d.type !== "open_whatsapp") return;
      try {
        chrome.runtime.sendMessage({ type: "garimpo_open_whatsapp", phone: d.phone, text: d.text });
        window.postMessage({ source: "garimpo-ext", type: "open_ack", reqId: d.reqId }, "*");
      } catch {
      }
    });
  }
})();
