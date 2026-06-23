// Link de conversa do WhatsApp para o fluxo de desktop (WhatsApp Web).
// Vai direto pro web.whatsapp.com/send, sem a tela intermediaria do wa.me, e deve
// ser aberto sempre na MESMA aba nomeada (WA_TAB) para nao empilhar uma aba nova
// a cada disparo. Continua logado (sessao no proprio WhatsApp Web); ele so troca
// de conversa naquela aba.
//
// Obs: o fluxo mobile (pagina "No celular") segue usando wa.me, que abre o app.
export const WA_TAB = "whatsapp";

export function waSend(phone?: string | null, text?: string): string | undefined {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  const num = d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
  const base = `https://web.whatsapp.com/send?phone=${num}`;
  return text && text.trim() ? `${base}&text=${encodeURIComponent(text)}` : base;
}

// Referencia da aba do WhatsApp que ESTE sistema abriu. Guardada no `window`
// GLOBAL (nao no modulo): o Next pode duplicar o modulo por rota, e ai cada
// pagina teria sua propria variavel = abriria aba nova por pagina. No global e
// uma so pra todo o app. Reusar a MESMA aba e mais confiavel que o target
// nomeado, porque o WhatsApp Web reseta o window.name.
function waSlot(): { win: Window | null } {
  const g = window as unknown as { __waWin?: { win: Window | null } };
  if (!g.__waWin) g.__waWin = { win: null };
  return g.__waWin;
}

// Fallback pela web: reusa UMA aba so (window ref global). Pode abrir uma aba
// propria; e o melhor que o site sozinho consegue (nao mira a aba que voce abriu
// na mao). SEM noopener/noreferrer (eles virariam _blank = aba nova).
function openWeb(phone?: string | null, text?: string): boolean {
  const url = waSend(phone, text);
  if (!url) return false;
  const slot = waSlot();
  let win = slot.win;
  if (win && !win.closed) {
    try {
      win.location.href = url;
    } catch {
      win = null;
    }
  } else {
    win = null;
  }
  if (!win) win = window.open(url, WA_TAB);
  slot.win = win;
  try {
    win?.focus();
  } catch {
    /* ignora */
  }
  return true;
}

// Abre a conversa. Se a extensao Garimpo esta presente (marca data-garimpo-ext),
// delega pra ela (troca a conversa na MESMA aba, sem reload via wa-js). A
// extensao confirma com um "ack"; se NAO confirmar em 0,8s (ex: content script
// orfao depois de recarregar a extensao sem recarregar a aba do CRM), cai no
// fallback web sozinho — assim NUNCA fica "nada acontecendo".
export function openWhatsApp(phone?: string | null, text?: string): boolean {
  if (typeof window === "undefined") return false;
  if (document.documentElement.getAttribute("data-garimpo-ext") !== "1") {
    return openWeb(phone, text);
  }
  const reqId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  let acked = false;
  const onAck = (e: MessageEvent) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "garimpo-ext" || d.type !== "open_ack" || d.reqId !== reqId) return;
    acked = true;
    window.removeEventListener("message", onAck);
  };
  window.addEventListener("message", onAck);
  window.postMessage(
    { source: "garimpo-crm", type: "open_whatsapp", phone: phone ?? "", text: text ?? "", reqId },
    "*",
  );
  window.setTimeout(() => {
    window.removeEventListener("message", onAck);
    if (!acked) openWeb(phone, text);
  }, 800);
  return true;
}
