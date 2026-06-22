"use client";
// Hook reutilizavel para cancelar reuniao de um lead.
//
// Fluxo:
//  1. Limpa meeting_at, meeting_link, meeting_location e meeting_gcal_event_id no BD.
//  2. Best-effort: apaga o evento no Google Calendar se meeting_gcal_event_id existir.
//  3. Emite toast de feedback.
//
// NAO muda o status do lead.

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { getRepo } from "@/lib/repo";
import { deleteCalendarEvent } from "@/lib/calendar";
import type { Lead } from "@/lib/types";

export function useCancelMeeting(onSuccess?: () => void | Promise<void>) {
  const repo = getRepo();
  const [cancelling, setCancelling] = useState(false);

  const cancelMeeting = useCallback(
    async (lead: Lead) => {
      setCancelling(true);
      try {
        // 1) Limpa todos os campos de reuniao no banco.
        await repo.update(lead.id, {
          meeting_at: null,
          meeting_link: null,
          meeting_location: null,
          meeting_gcal_event_id: null,
        });

        // 2) Best-effort: tenta apagar o evento no Google Calendar.
        if (lead.meeting_gcal_event_id) {
          // Nao aguardamos o retorno em try/catch extra: deleteCalendarEvent
          // nunca lanca, ja trata erros internamente.
          void deleteCalendarEvent(lead.meeting_gcal_event_id);
        }

        toast.success("Reuniao cancelada.");

        // 3) Refresca a view (Agenda ou Ficha).
        if (onSuccess) {
          await onSuccess();
        }
      } catch {
        toast.error("Nao foi possivel cancelar a reuniao. Tente de novo.");
      } finally {
        setCancelling(false);
      }
    },
    [repo, onSuccess],
  );

  return { cancelMeeting, cancelling };
}
