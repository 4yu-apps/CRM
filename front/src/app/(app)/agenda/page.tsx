"use client";
import { useMemo } from "react";
import Link from "next/link";
import {
  CalendarBlank,
  CalendarX,
  Spinner,
  VideoCamera,
  MapPin,
  ArrowSquareOut,
  Clock,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { useCancelMeeting } from "@/hooks/use-cancel-meeting";
import {
  upcomingMeetings,
  meetingBucket,
  meetingModality,
  BUCKET_LABEL,
  type Bucket,
  type Meeting,
} from "@/lib/meetings";
import { STATUS_META, TONE_CLASSES } from "@/lib/state-machine";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";

const ORDER: Bucket[] = ["hoje", "amanha", "semana", "depois"];

function MeetingRow({
  m,
  onCancel,
  cancelling,
}: {
  m: Meeting;
  onCancel: (lead: Lead) => void;
  cancelling: boolean;
}) {
  const { lead } = m;
  const modality = meetingModality(lead);
  const meta = STATUS_META[lead.status];
  return (
    <div className="flex items-center gap-3 rounded-[14px] border border-border bg-card px-4 py-3 shadow-[var(--shadow)]">
      <Link
        href={`/ficha/${lead.id}`}
        className="flex min-w-0 flex-1 items-center gap-3 transition-colors hover:opacity-80"
      >
        <div className="flex w-[68px] flex-none flex-col items-center justify-center rounded-[10px] bg-brand-50 py-1.5 text-brand">
          <span className="text-[15px] font-bold leading-none">
            {m.at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
          </span>
          <span className="mt-0.5 text-[10.5px] font-semibold uppercase">
            {m.at.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="truncate text-[14.5px] font-semibold text-ink">
            {lead.business_name ?? "(sem nome)"}
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[12px]">
            <span className={cn("rounded-full px-2 py-0.5 font-semibold", TONE_CLASSES[meta.tone])}>
              {meta.label}
            </span>
            {modality === "online" && (
              <span className="inline-flex items-center gap-1 text-sky-600">
                <VideoCamera size={13} weight="fill" /> Online
              </span>
            )}
            {modality === "presencial" && (
              <span className="inline-flex items-center gap-1 text-emerald-600">
                <MapPin size={13} weight="fill" /> Presencial
              </span>
            )}
            {modality === "indefinido" && (
              <span className="inline-flex items-center gap-1 text-faint">
                <Clock size={13} /> Sem link/local
              </span>
            )}
          </div>
        </div>

        {modality === "online" && lead.meeting_link && (
          <a
            href={lead.meeting_link}
            target="_blank"
            rel="noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="flex flex-none items-center gap-1.5 rounded-[10px] bg-sky-500/12 px-3 py-2 text-[12.5px] font-semibold text-sky-700 hover:bg-sky-500/20"
          >
            Entrar <ArrowSquareOut size={13} weight="bold" />
          </a>
        )}
        {modality === "presencial" && lead.meeting_location && (
          <span className="max-w-[160px] flex-none truncate text-right text-[12px] text-muted-foreground">
            {lead.meeting_location}
          </span>
        )}
      </Link>
      <button
        type="button"
        onClick={() => onCancel(lead)}
        disabled={cancelling}
        title="Cancelar reunião"
        aria-label="Cancelar reunião"
        className="flex flex-none items-center gap-1 rounded-[8px] px-2.5 py-1.5 text-[12px] font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-50"
      >
        <CalendarX size={14} weight="bold" />
        Cancelar
      </button>
    </div>
  );
}

export default function AgendaPage() {
  const { leads, loading, refresh } = useLeads();
  const { cancelMeeting, cancelling } = useCancelMeeting(refresh);

  const grouped = useMemo(() => {
    const ms = upcomingMeetings(leads);
    const map = new Map<Bucket, Meeting[]>();
    for (const m of ms) {
      const b = meetingBucket(m.at);
      (map.get(b) ?? map.set(b, []).get(b)!).push(m);
    }
    return map;
  }, [leads]);

  const total = useMemo(() => upcomingMeetings(leads).length, [leads]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[760px] items-center justify-center py-24">
        <Spinner size={28} className="animate-spin text-brand" />
      </div>
    );
  }

  if (total === 0) {
    return (
      <div className="mx-auto max-w-[760px]">
        <div className="flex flex-col items-center gap-3 rounded-[18px] border border-dashed border-border-2 bg-card py-16 text-center">
          <CalendarBlank size={40} className="text-faint" />
          <div className="text-[15px] font-semibold text-ink">Nenhuma reunião marcada</div>
          <p className="max-w-[340px] text-[13px] text-muted-foreground">
            Quando você marcar uma reunião (no funil ou pela extensão), ela aparece aqui, com
            horário, link e endereço.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <div className="mb-5 text-[13px] text-muted-foreground">
        {total} {total === 1 ? "reunião marcada" : "reuniões marcadas"} daqui pra frente.
      </div>
      <div className="flex flex-col gap-7">
        {ORDER.filter((b) => grouped.has(b)).map((b) => (
          <div key={b}>
            <div className="mb-2.5 text-[12px] font-bold uppercase tracking-wider text-faint">
              {BUCKET_LABEL[b]}
            </div>
            <div className="flex flex-col gap-2.5">
              {grouped.get(b)!.map((m) => (
                <MeetingRow
                  key={m.lead.id}
                  m={m}
                  onCancel={cancelMeeting}
                  cancelling={cancelling}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
