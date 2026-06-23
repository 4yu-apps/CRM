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

// Abre/atualiza a conversa reusando UMA aba so. 1o clique abre; os proximos
// navegam a MESMA aba pra outra conversa (ja com a mensagem), sem empilhar.
// Limite do navegador: nao da pra mirar uma aba que VOCE abriu na mao (so a que
// o sistema abriu). SEM noopener/noreferrer (eles virariam _blank = aba nova).
export function openWhatsApp(phone?: string | null, text?: string): boolean {
  if (typeof window === "undefined") return false;
  // 1) Extensao Garimpo instalada (marca data-garimpo-ext na pagina): ela REUSA
  //    a aba do WhatsApp Web de verdade (o site sozinho nao consegue). Delega.
  if (document.documentElement.getAttribute("data-garimpo-ext") === "1") {
    window.postMessage(
      { source: "garimpo-crm", type: "open_whatsapp", phone: phone ?? "", text: text ?? "" },
      "*",
    );
    return true;
  }
  // 2) Sem extensao: fallback web (best-effort; pode abrir uma aba propria).
  const url = waSend(phone, text);
  if (!url) return false;
  const slot = waSlot();
  let win = slot.win;
  if (win && !win.closed) {
    // navega a aba ja aberta pra nova conversa (escrita cross-origin e permitida)
    try {
      win.location.href = url;
    } catch {
      win = null;
    }
  } else {
    win = null;
  }
  if (!win) {
    win = window.open(url, WA_TAB);
  }
  slot.win = win;
  try {
    win?.focus();
  } catch {
    /* focar pode falhar em alguns navegadores; ignora */
  }
  return true;
}
