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

// Le um valor em dinheiro digitado por gente, no jeito brasileiro.
//
// Existia um `parseFloat(v.replace(",", "."))` espalhado pelo app. Ele lia
// "2.500,00" como 2.5 e salvava R$ 2,50 sem reclamar: o dono digitava o valor
// certo e o CRM guardava mil vezes menos, calado. Aqui a regra e explicita.
//
// Retorna null quando nao da pra ler um numero (o chamador decide o que fazer).
export function parseBRL(raw: string): number | null {
  const clean = (raw ?? "").replace(/[^\d.,-]/g, "").trim();
  if (!clean) return null;

  const lastComma = clean.lastIndexOf(",");
  const lastDot = clean.lastIndexOf(".");

  let normalized: string;
  if (lastComma >= 0 && lastDot >= 0) {
    // Tem os dois: o que vier por ultimo e o separador decimal. Cobre tanto
    // "2.500,00" (pt-BR) quanto "2,500.00" (colado de algum lugar em ingles).
    const decimalAt = Math.max(lastComma, lastDot);
    const thousandsSep = decimalAt === lastComma ? "." : ",";
    normalized =
      clean.slice(0, decimalAt).split(thousandsSep).join("") + "." + clean.slice(decimalAt + 1);
  } else if (lastComma >= 0) {
    // So virgula: decimal. "1500,50" -> 1500.50
    normalized = clean.replace(",", ".");
  } else if (lastDot >= 0) {
    // So ponto, e aqui mora a ambiguidade. "2.500" e dois mil e quinhentos pra
    // um brasileiro, mas "2.5" e dois e meio. Regra: mais de um ponto, ou
    // exatamente tres digitos depois do ponto, e separador de milhar.
    const parts = clean.split(".");
    const casas = parts[parts.length - 1].length;
    normalized = parts.length > 2 || casas === 3 ? parts.join("") : clean;
  } else {
    normalized = clean;
  }

  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}

// timestamptz -> "YYYY-MM-DD" no fuso local (o formato que <input type="date"> quer).
export function toDateInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const mes = String(d.getMonth() + 1).padStart(2, "0");
  const dia = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

// "YYYY-MM-DD" -> ISO fixado ao MEIO-DIA local.
//
// Meia-noite seria o obvio e esta errado: `new Date("2026-08-06")` e meia-noite
// UTC, que no Brasil e dia 05 as 21h. O contrato passaria a constar como fechado
// na vespera, e a conta de renovacao herdaria o erro. Meio-dia da 12 horas de
// folga pra cada lado, entao nenhum fuso do pais escorrega de dia.
export function fromDateInput(value: string): string | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0).toISOString();
}

// Hoje no formato do <input type="date">.
export function todayInput(): string {
  return toDateInput(new Date().toISOString());
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
