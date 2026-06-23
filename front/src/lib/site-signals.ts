// Chips de diagnostico do site a partir do site_signals (enriquecido de graca
// pela esteira). Compartilhado pela ficha e pela fila pra ficarem consistentes.
import type { SiteSignals } from "./types";

export type SignalChip = { label: string; variant: "neutral" | "positive" | "warn" };

const PLAT_LABEL: Record<string, string> = { meta: "Meta", google: "Google Ads", tiktok: "TikTok" };

export function siteSignalChips(signals: SiteSignals | null | undefined): SignalChip[] {
  if (!signals) return [];
  const chips: SignalChip[] = [];

  // "Ja anuncia?": so PIXEL DE ANUNCIO de verdade (Meta/Google Ads/TikTok), nao
  // analytics. ad_platforms e a lista canonica; has_* sao fallback p/ dado antigo.
  const platforms = signals.ad_platforms?.length
    ? signals.ad_platforms
    : [
        ...(signals.has_fb_pixel ? ["meta"] : []),
        ...(signals.has_google_ads ? ["google"] : []),
        ...(signals.has_tiktok_pixel ? ["tiktok"] : []),
      ];
  if (platforms.length > 0) {
    chips.push({ label: `Ja anuncia: ${platforms.map((p) => PLAT_LABEL[p] ?? p).join(", ")}`, variant: "neutral" });
  } else if (signals.has_google_tag) {
    chips.push({ label: "Tem analytics, sem pixel de anuncio", variant: "neutral" });
  }

  // Performance real do PageSpeed (Google), quando medida.
  if (typeof signals.perf_score === "number") {
    const lento = signals.perf_slow ?? signals.perf_score < 50;
    chips.push({ label: `PageSpeed ${signals.perf_score}/100 no celular`, variant: lento ? "warn" : "positive" });
  }

  if (signals.has_chat_widget === true) {
    const vendor = signals.chat_vendor ? ` (${signals.chat_vendor})` : "";
    chips.push({ label: `Tem chatbot${vendor}`, variant: "neutral" });
  } else if (signals.has_chat_widget === false) {
    chips.push({ label: "Atende no manual", variant: "neutral" });
  }
  if (signals.has_online_booking === true) chips.push({ label: "Agendamento online", variant: "neutral" });
  if (signals.has_ecommerce === true) chips.push({ label: "Vende online (e-commerce)", variant: "neutral" });
  if (signals.has_form === true) chips.push({ label: "Tem formulario", variant: "neutral" });

  // Outros canais sociais alem de IG/FB (onde o negocio ja esta).
  const canais = [
    ...(signals.has_tiktok ? ["TikTok"] : []),
    ...(signals.has_youtube ? ["YouTube"] : []),
    ...(signals.has_linkedin ? ["LinkedIn"] : []),
  ];
  if (canais.length > 0) chips.push({ label: `Tambem em ${canais.join(", ")}`, variant: "neutral" });

  if (signals.mobile_ready === false) chips.push({ label: "Site nao adaptado pro celular", variant: "warn" });
  if (signals.slow === true) chips.push({ label: "Site pesado", variant: "warn" });
  if (signals.stack) chips.push({ label: `Feito em ${signals.stack}`, variant: "neutral" });
  if (signals.https === false) chips.push({ label: "Site sem HTTPS", variant: "warn" });

  return chips;
}

// Classe Tailwind de cor por variante do chip.
export function signalChipClass(variant: SignalChip["variant"]): string {
  if (variant === "positive") return "bg-emerald-500/12 text-emerald-700";
  if (variant === "warn") return "bg-amber-500/15 text-amber-700";
  return "bg-accent text-ink-2";
}
