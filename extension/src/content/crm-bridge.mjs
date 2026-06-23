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
  } catch {
    /* extensao recarregando/sem contexto: ignora */
  }
});
