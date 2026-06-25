// Formatadores pequenos (pt-BR).

export function fmtPhone(raw: string | null): string {
  if (!raw) return "-";
  const d = raw.replace(/\D/g, "");
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return raw;
}

export function fmtCnpj(raw: string | null): string {
  if (!raw) return "-";
  const d = raw.replace(/\D/g, "");
  if (d.length !== 14) return raw;
  return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
}

const rtf = new Intl.RelativeTimeFormat("pt-BR", { numeric: "auto" });
const DIV: [number, Intl.RelativeTimeFormatUnit][] = [
  [60, "seconds"],
  [60, "minutes"],
  [24, "hours"],
  [7, "days"],
  [4.34524, "weeks"],
  [12, "months"],
  [Infinity, "years"],
];

export function fmtRelative(iso: string): string {
  let duration = (new Date(iso).getTime() - Date.now()) / 1000;
  for (const [amount, unit] of DIV) {
    if (Math.abs(duration) < amount) return rtf.format(Math.round(duration), unit);
    duration /= amount;
  }
  return iso;
}

export function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const SOURCE_LABELS: Record<string, string> = {
  google_maps: "Google Maps",
  openstreetmap: "OpenStreetMap",
  cnpj_brasilapi: "CNPJ · BrasilAPI",
  cnpj_ws: "CNPJ · CNPJ.ws",
  cnpj_lookup: "CNPJ · Receita",
  instagram: "Instagram",
  website: "Site",
  meta_ad_library: "Meta Ad Library",
  biz_signals: "Sinais públicos",
  manual: "Manual",
  extension: "Extensao",
};

export function sourceLabel(s: string): string {
  return SOURCE_LABELS[s] ?? s;
}
