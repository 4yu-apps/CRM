// Service worker (MV3). Recebe do CRM (via content script bridge) o pedido de
// "abrir conversa" e abre no WhatsApp Web REUSANDO a aba ja aberta: acha a aba,
// foca e navega ELA pra conversa. Assim nao empilha varias abas (o site sozinho
// nao consegue mirar uma aba; a extensao consegue, via chrome.tabs).
//
// Respeita o read-only: NAO envia. So abre a conversa com o texto pre-preenchido
// pela URL oficial do WhatsApp (/send?text=). Quem aperta enviar e o usuario.

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
      // reusa a aba existente: ativa, foca a janela e navega pra conversa
      chrome.tabs.update(tab.id, { active: true, url });
      if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
    } else {
      // nenhuma aba do WhatsApp aberta: abre uma (unica)
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
