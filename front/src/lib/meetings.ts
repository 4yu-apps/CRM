// Reunioes (Slice E): deriva a agenda e as notificacoes a partir dos leads que
// tem meeting_at. Nada de tabela nova — a reuniao mora no lead.
import type { Lead } from "./types";

export type Modality = "online" | "presencial" | "indefinido";

export interface Meeting {
  lead: Lead;
  at: Date;
}

const HOUR = 3_600_000;

export function meetingModality(lead: Lead): Modality {
  if (lead.meeting_link?.trim()) return "online";
  if (lead.meeting_location?.trim()) return "presencial";
  return "indefinido";
}

// Todas as reunioes marcadas (lead com meeting_at valido, nao arquivado),
// ordenadas da mais proxima pra mais distante.
export function leadMeetings(leads: Lead[]): Meeting[] {
  return leads
    .filter((l) => l.meeting_at && !l.archived)
    .map((l) => ({ lead: l, at: new Date(l.meeting_at as string) }))
    .filter((m) => !Number.isNaN(m.at.getTime()))
    .sort((a, b) => a.at.getTime() - b.at.getTime());
}

// Reunioes de agora em diante (com uma folga: ainda mostra a que comecou ha
// pouco). graceHours evita sumir com a reuniao "de agora".
export function upcomingMeetings(leads: Lead[], graceHours = 2): Meeting[] {
  const cutoff = Date.now() - graceHours * HOUR;
  return leadMeetings(leads).filter((m) => m.at.getTime() >= cutoff);
}

// Pro sininho: as proximas dentro de uma janela (ex.: 48h).
export function meetingsWithin(leads: Lead[], hours: number): Meeting[] {
  const max = Date.now() + hours * HOUR;
  return upcomingMeetings(leads).filter((m) => m.at.getTime() <= max);
}

export type Bucket = "hoje" | "amanha" | "semana" | "depois";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export function meetingBucket(at: Date, now = new Date()): Bucket {
  const days = Math.round((+startOfDay(at) - +startOfDay(now)) / 86_400_000);
  if (days <= 0) return "hoje";
  if (days === 1) return "amanha";
  if (days <= 7) return "semana";
  return "depois";
}

export const BUCKET_LABEL: Record<Bucket, string> = {
  hoje: "Hoje",
  amanha: "Amanha",
  semana: "Esta semana",
  depois: "Mais pra frente",
};

// "hoje 15:00" / "amanha 10:00" / "12/08 14:00"
export function fmtMeetingWhen(at: Date, now = new Date()): string {
  const time = at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const bucket = meetingBucket(at, now);
  if (bucket === "hoje") return `hoje ${time}`;
  if (bucket === "amanha") return `amanha ${time}`;
  const d = at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
  return `${d} ${time}`;
}
