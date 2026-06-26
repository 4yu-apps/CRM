// Calcula "aberto agora?" a partir do horario normalizado (hours_struct), sempre
// no fuso de Brasilia — independe do fuso do navegador. Serve a tag "fora do
// horario" (pra nao mandar mensagem 20h de sabado e ninguem responder).
import type { BusinessHours } from "./types";

const WD: Record<string, string> = {
  Sun: "sun", Mon: "mon", Tue: "tue", Wed: "wed", Thu: "thu", Fri: "fri", Sat: "sat",
};

export type OpenState = { open: boolean; label: string };

// Devolve {open,label} ou null quando não há horário conhecido (não mostra tag).
export function openState(hours: BusinessHours | null | undefined, now: Date = new Date()): OpenState | null {
  const days = hours?.days;
  if (!days || Object.keys(days).length === 0) return null;

  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Sao_Paulo",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(now);

  const wd = parts.find((p) => p.type === "weekday")?.value ?? "";
  let hh = parts.find((p) => p.type === "hour")?.value ?? "00";
  const mm = parts.find((p) => p.type === "minute")?.value ?? "00";
  if (hh === "24") hh = "00"; // alguns ambientes devolvem 24 pra meia-noite
  const key = WD[wd];
  const cur = `${hh}${mm}`; // "HHMM" — comparação lexicográfica funciona (mesmo tamanho)

  const spans = (key && days[key]) || [];
  const open = spans.some(([abre, fecha]) => cur >= abre && cur < fecha);
  return { open, label: open ? "Aberto agora" : "Fora do horário" };
}
