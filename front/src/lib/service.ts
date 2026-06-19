import type { ServiceTarget } from "./types";

// Dois servicos (B1): o badge legivel e a cor de cada alvo.
export const SERVICE_META: Record<ServiceTarget, { label: string; short: string; badge: string }> = {
  trafego: {
    label: "Tráfego",
    short: "Tráfego",
    badge: "bg-brand-50 text-brand-700",
  },
  automacao: {
    label: "Automação",
    short: "Automação",
    badge: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
  },
  ambos: {
    label: "Tráfego + Automação",
    short: "Ambos",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
  },
  indefinido: {
    label: "A definir",
    short: "A definir",
    badge: "bg-muted text-muted-foreground",
  },
};
