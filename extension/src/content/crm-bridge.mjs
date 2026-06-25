// Ponte na pagina do CRM (crm.4yumkt.com.br). Faz duas coisas:
// 1) marca presenca, pro front saber que pode delegar o "abrir WhatsApp" pra
//    extensao (que reusa a aba) em vez do window.open (que abre aba nova);
// 2) repassa o pedido da pagina pro service worker.
// So a extensao enxerga chrome.* aqui; a pagina fala via window.postMessage.

// Versao do manifest: deixa o CRM saber presenca E versao (pra futuros nudges
// de "atualize a extensao"). Falha silenciosa se o contexto da extensao sumiu.
const extVersion = (() => {
  try {
    return chrome.runtime.getManifest().version;
  } catch {
    return "";
  }
})();
document.documentElement.setAttribute("data-garimpo-ext", "1");
if (extVersion) document.documentElement.setAttribute("data-garimpo-ext-version", extVersion);
window.postMessage({ source: "garimpo-ext", type: "ready", version: extVersion }, "*");

// Guarda contra reinjecao: o background reinjeta este script nas abas abertas
// quando a extensao recarrega. O flag no window do mundo isolado evita registrar
// o listener duas vezes num contexto que ainda esta vivo.
if (!window.__garimpoCrmBridge) {
  window.__garimpoCrmBridge = true;
  window.addEventListener("message", (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "garimpo-crm" || d.type !== "open_whatsapp") return;
    try {
      chrome.runtime.sendMessage({ type: "garimpo_open_whatsapp", phone: d.phone, text: d.text });
      // confirma pro front que repassou. Se o content script estiver orfao
      // (contexto invalidado), o sendMessage acima joga excecao e o ack NAO sai
      // -> o front cai no fallback web sozinho.
      window.postMessage({ source: "garimpo-ext", type: "open_ack", reqId: d.reqId }, "*");
    } catch {
      /* sem contexto: nao confirma (front faz fallback) */
    }
  });
}
