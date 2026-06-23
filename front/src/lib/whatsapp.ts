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

// Referencia viva da aba do WhatsApp que ESTE sistema abriu. Persiste no SPA
// (modulo nao recarrega entre telas), entao da pra reusar a MESMA aba a cada
// clique. Mais confiavel que so o target nomeado, porque o WhatsApp Web pode
// resetar o window.name (o que faria abrir aba nova toda vez).
let waWin: Window | null = null;

// Abre/atualiza a conversa do WhatsApp reusando UMA aba so. 1o clique abre a aba;
// os proximos navegam a MESMA aba pra outra conversa (ja com a mensagem), sem
// empilhar. Limite do navegador: nao da pra mirar uma aba que VOCE abriu na mao
// (so a que o sistema abriu); por isso ele mantem a propria aba.
// SEM noopener/noreferrer de proposito (eles fariam virar _blank = aba nova).
export function openWhatsApp(phone?: string | null, text?: string): boolean {
  const url = waSend(phone, text);
  if (!url || typeof window === "undefined") return false;
  try {
    if (waWin && !waWin.closed) {
      // navega a aba ja aberta pra nova conversa (escrita cross-origin e permitida)
      waWin.location.href = url;
      waWin.focus();
      return true;
    }
  } catch {
    /* se der ruim, abre de novo abaixo */
  }
  waWin = window.open(url, WA_TAB);
  waWin?.focus?.();
  return true;
}
