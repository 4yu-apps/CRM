// #9 — Filtro por sinal de qualidade. Define o angulo de venda: quem ja
// anuncia, quem tem site mas nao anuncia (oportunidade de trafego), quem nao
// tem site, quem tem site lento. Compartilhado por fila e contatos pra ficar
// consistente. Tudo deriva de campos que JA existem no Lead (sem schema).
import type { Lead } from "./types";

export type SignalFilter = "" | "ja_anuncia" | "nao_anuncia" | "sem_site" | "site_lento";

export const SIGNAL_FILTER_OPTIONS: { value: SignalFilter; label: string }[] = [
  { value: "", label: "Todos os sinais" },
  { value: "ja_anuncia", label: "Já anuncia" },
  { value: "nao_anuncia", label: "Tem site, não anuncia" },
  { value: "sem_site", label: "Sem site" },
  { value: "site_lento", label: "Site lento" },
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
  }
}
