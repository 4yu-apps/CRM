// Ponte ISOLADA no WhatsApp Web entre o background (chrome.runtime) e o glue do
// mundo da pagina (window.postMessage). O background pede "trocar conversa"; o
// relay repassa pro glue (que usa o WPP) e devolve se conseguiu (sem reload). Se
// nao responder a tempo, devolve ok:false -> o background navega (fallback).

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
    sendResponse({ ok: false }); // glue nao respondeu (wa-js ainda nao pronto) -> fallback
  }, 6000);
  function cleanup() {
    clearTimeout(to);
    window.removeEventListener("message", onMsg);
  }

  window.addEventListener("message", onMsg);
  window.postMessage({ source: "garimpo-sw", type: "open_chat", phone: msg.phone, text: msg.text, reqId }, "*");
  return true; // resposta assincrona
});
