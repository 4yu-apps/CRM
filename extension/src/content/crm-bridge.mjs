// Ponte na pagina do CRM (crm.4yumkt.com.br). Faz duas coisas:
// 1) marca presenca, pro front saber que pode delegar o "abrir WhatsApp" pra
//    extensao (que reusa a aba) em vez do window.open (que abre aba nova);
// 2) repassa o pedido da pagina pro service worker.
// So a extensao enxerga chrome.* aqui; a pagina fala via window.postMessage.

document.documentElement.setAttribute("data-garimpo-ext", "1");
window.postMessage({ source: "garimpo-ext", type: "ready" }, "*");

window.addEventListener("message", (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.source !== "garimpo-crm" || d.type !== "open_whatsapp") return;
  try {
    chrome.runtime.sendMessage({ type: "garimpo_open_whatsapp", phone: d.phone, text: d.text });
    // confirma pro front que repassou. Se o content script estiver orfao (extensao
    // recarregada sem recarregar a aba), o sendMessage acima joga excecao e o ack
    // NAO sai -> o front cai no fallback web sozinho.
    window.postMessage({ source: "garimpo-ext", type: "open_ack", reqId: d.reqId }, "*");
  } catch {
    /* sem contexto: nao confirma (front faz fallback) */
  }
});
