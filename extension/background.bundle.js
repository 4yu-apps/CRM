(() => {
  // src/background.mjs
  function waUrl(phone, text) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return null;
    const num = digits.startsWith("55") ? digits : digits.length >= 12 ? digits : `55${digits}`;
    const base = `https://web.whatsapp.com/send?phone=${num}`;
    return text && String(text).trim() ? `${base}&text=${encodeURIComponent(text)}` : base;
  }
  function openWhatsApp(phone, text) {
    const url = waUrl(phone, text);
    if (!url) return;
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      if (tabs && tabs.length > 0) {
        const tab = tabs[0];
        chrome.tabs.update(tab.id, { active: true, url });
        if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url });
      }
    });
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "garimpo_open_whatsapp") {
      openWhatsApp(msg.phone, msg.text);
      if (sendResponse) sendResponse({ ok: true });
    }
    return false;
  });
})();
