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
