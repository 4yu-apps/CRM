// #9 — Filtro por sinal de qualidade. Define o angulo de venda: quem ja
// anuncia, quem tem site mas nao anuncia (oportunidade de trafego), quem nao
// tem site, quem tem site lento. Compartilhado por fila e contatos pra ficar
// consistente. Tudo deriva de campos que JA existem no Lead (sem schema).
import type { SignalChip } from "./site-signals";
import type { Lead } from "./types";

export type SignalFilter =
  | ""
  | "ja_anuncia"
  | "nao_anuncia"
  | "sem_site"
  | "site_lento"
  | "sem_chatbot"
  | "sem_agendamento"
  | "tem_loja"
  | "sem_instagram"
  | "empresa_nova";

export const SIGNAL_FILTER_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: "", label: "Todos os sinais" },
  { value: "empresa_nova", label: "Negócio novo (aberto há pouco)" },
  { value: "ja_anuncia", label: "Tráfego: já anuncia" },
  { value: "nao_anuncia", label: "Tráfego: tem site, não anuncia" },
  { value: "sem_site", label: "Design: sem site" },
  { value: "site_lento", label: "Design: site lento" },
  { value: "sem_chatbot", label: "Automação: site sem chat" },
  { value: "sem_agendamento", label: "Automação: sem agendamento online" },
  { value: "tem_loja", label: "Automação: tem loja online" },
  { value: "sem_instagram", label: "Marketing: sem Instagram" },
];

export function jaAnuncia(l: Lead): boolean {
  if (l.ads_active === true) return true;
  const s = l.site_signals;
  if (!s) return false;
  return (
    (s.ad_platforms?.length ?? 0) > 0 ||
    !!s.has_fb_pixel ||
    !!s.has_google_ads ||
    !!s.has_tiktok_pixel
  );
}

export function temSite(l: Lead): boolean {
  return !!(l.website && l.website.trim());
}

export function siteLento(l: Lead): boolean {
  const s = l.site_signals;
  if (!s) return false;
  if (s.perf_slow === true || s.slow === true) return true;
  if (typeof s.perf_score === "number" && s.perf_score < 50) return true;
  if (s.speed_category === "SLOW") return true;
  return false;
}

export function temInstagram(l: Lead): boolean {
  return !!(l.instagram && l.instagram.trim());
}

export function siteSemChat(l: Lead): boolean {
  const s = l.site_signals;
  return temSite(l) && !!s && s.has_chat_widget === false;
}

export function semAgendamento(l: Lead): boolean {
  const s = l.site_signals;
  return temSite(l) && !!s && s.has_online_booking === false;
}

export function temLoja(l: Lead): boolean {
  return l.site_signals?.has_ecommerce === true;
}

// O1 "negocio novo": meses desde a abertura (opened_on, ISO YYYY-MM-DD da
// BrasilAPI). null quando nao se sabe a data.
export function mesesDesdeAbertura(l: Lead): number | null {
  if (!l.opened_on) return null;
  const d = new Date(`${l.opened_on}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(m, 0);
}

// Negocio novo/recente: aberto ha no maximo 18 meses (faixa onde o score premia).
export function negocioNovo(l: Lead): boolean {
  const m = mesesDesdeAbertura(l);
  return m !== null && m <= 18;
}

// Chip pra fila/ficha. null quando nao se aplica (sem data ou ja estabelecido).
export function negocioNovoChip(l: Lead): SignalChip | null {
  const m = mesesDesdeAbertura(l);
  if (m === null || m > 18) return null;
  return { label: m < 6 ? "Negocio novo" : "Negocio recente", variant: "positive" };
}

export function matchesSignal(l: Lead, f: SignalFilter): boolean {
  switch (f) {
    case "":
      return true;
    case "ja_anuncia":
      return jaAnuncia(l);
    case "nao_anuncia":
      return temSite(l) && !jaAnuncia(l);
    case "sem_site":
      return !temSite(l);
    case "site_lento":
      return siteLento(l);
    case "sem_chatbot":
      return siteSemChat(l);
    case "sem_agendamento":
      return semAgendamento(l);
    case "tem_loja":
      return temLoja(l);
    case "sem_instagram":
      return !temInstagram(l);
    case "empresa_nova":
      return negocioNovo(l);
    default:
      return false;
  }
}
