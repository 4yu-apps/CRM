// Link de conversa do WhatsApp para o fluxo de desktop (WhatsApp Web).
// Vai direto pro web.whatsapp.com/send, sem a tela intermediaria do wa.me, e deve
// ser aberto sempre na MESMA aba nomeada (WA_TAB) para nao empilhar uma aba nova
// a cada disparo. Continua logado (sessao no proprio WhatsApp Web); ele so troca
// de conversa naquela aba.
//
// Obs: o fluxo mobile (pagina "No celular") segue usando wa.me, que abre o app.
import { toast } from "sonner";

export const WA_TAB = "whatsapp";

// Guarda anti-bloqueio no disparo. O maior risco de ban NAO e "colar texto pronto"
// (o WhatsApp ve um clique humano no enviar), e sim o VOLUME e a VELOCIDADE de
// conversas novas abertas em sequencia. Aqui limitamos disparos/dia e forcamos um
// respiro entre um e outro. Contagem no localStorage (por navegador, reseta no dia).
const WA_DAILY_CAP = 80;
const WA_COOLDOWN_MS = 6000;
const WA_COUNT_PREFIX = "wa-open-count-";
const WA_LAST_KEY = "wa-open-last";

// true = pode disparar agora (e ja contabiliza); false = barrado (avisa por toast).
// Sem localStorage (ou erro), nao bloqueia: a guarda e best-effort, nunca trava o app.
function throttleOk(): boolean {
  try {
    const now = Date.now();
    const last = Number(localStorage.getItem(WA_LAST_KEY) || 0);
    const since = now - last;
    if (last && since < WA_COOLDOWN_MS) {
      toast.warning(`Espera ${Math.ceil((WA_COOLDOWN_MS - since) / 1000)}s entre disparos (anti-bloqueio).`);
      return false;
    }
    const key = WA_COUNT_PREFIX + new Date().toISOString().slice(0, 10);
    const count = Number(localStorage.getItem(key) || 0);
    if (count >= WA_DAILY_CAP) {
      toast.error(`Limite de ${WA_DAILY_CAP} disparos hoje (anti-bloqueio). Continue amanhã.`);
      return false;
    }
    localStorage.setItem(WA_LAST_KEY, String(now));
    localStorage.setItem(key, String(count + 1));
    return true;
  } catch {
    return true;
  }
}

// No celular, web.whatsapp.com nao serve: o Android ate intercepta a URL e abre
// o app, mas o iOS mostra a tela "acesse no navegador do seu computador" e o
// fluxo morre ali. O wa.me e universal link nos dois: abre o app instalado, e
// sem app cai numa pagina que ainda leva pra conversa.
export function isMobile(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  if (/Android|iPhone|iPad|iPod/i.test(ua)) return true;
  // iPadOS 13+ se apresenta como Macintosh; o toque desmente.
  return /Macintosh/.test(ua) && (navigator.maxTouchPoints ?? 0) > 1;
}

export function waSend(phone?: string | null, text?: string): string | undefined {
  const d = (phone ?? "").replace(/\D/g, "");
  if (!d) return undefined;
  const num = d.startsWith("55") ? d : d.length >= 12 ? d : `55${d}`;
  const corpo = text && text.trim() ? encodeURIComponent(text) : "";
  if (isMobile()) {
    return corpo ? `https://wa.me/${num}?text=${corpo}` : `https://wa.me/${num}`;
  }
  const base = `https://web.whatsapp.com/send?phone=${num}`;
  return corpo ? `${base}&text=${corpo}` : base;
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
  // No celular nao existe "reusar aba": abrir uma nova deixa uma aba vazia pra
  // tras depois que o app assume. Navegar a propria aba e o comportamento certo.
  if (isMobile()) {
    window.location.href = url;
    return true;
  }
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
  if (!(phone ?? "").replace(/\D/g, "")) return false; // numero invalido: nao conta nem dispara
  if (!throttleOk()) return false; // cap diario / cooldown (anti-bloqueio)
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
