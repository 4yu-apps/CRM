"use client";
// #5 + #6 — Acao rapida no card: muda status e/ou registra um toque de 1 linha
// sem abrir a ficha. Os botoes sao contextuais (saem da maquina de estados),
// so transicoes que NAO exigem dado extra (reuniao precisa de data -> fica no
// funil).
//
// A nota digitada aqui vira ATIVIDADE na linha do tempo. Antes ela era
// prefixada com "[dd/mm/aaaa]" no campo notes do lead, o que fazia dois
// escritores brigarem pelo mesmo texto: o textarea da ficha sobrescrevia tudo e
// apagava o log em silencio. Agora cada um tem seu lugar: evento na timeline,
// anotacao livre sobre a conta no notes.
import { useState } from "react";
import { toast } from "sonner";
import { nextStatuses, canTransition, STATUS_META } from "@/lib/state-machine";
import type { LeadsRepo } from "@/lib/repo";
import type { Lead, LeadStatus } from "@/lib/types";

// Alvos rapidos (sem dado extra). reuniao/proposta/fechado ficam de fora porque
// pedem data/valor; esses continuam no funil.
const QUICK_TARGETS: LeadStatus[] = [
  "respondeu",
  "interessado",
  "sem_resposta",
  "sem_interesse",
  "perdido",
  "descartado",
];

// Tom do chip por status (verde = avanco bom, vermelho = perda/saida).
function chipTone(s: LeadStatus): string {
  if (s === "respondeu" || s === "interessado") {
    return "border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400";
  }
  if (s === "sem_resposta") {
    return "border-sky-300 text-sky-700 hover:bg-sky-50 dark:border-sky-800 dark:text-sky-400";
  }
  return "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400";
}

export function QuickActions({
  lead,
  repo,
  onDone,
}: {
  lead: Lead;
  repo: LeadsRepo;
  onDone: () => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const targets = nextStatuses(lead.status).filter(
    (s) => QUICK_TARGETS.includes(s) && canTransition(lead.status, s, lead.opt_out ?? false)
  );

  const attachNote = async () => {
    if (!note.trim()) return;
    await repo.addActivity(lead.id, { kind: "nota", body: note.trim() });
  };

  const move = async (to: LeadStatus) => {
    setBusy(true);
    try {
      if (note.trim()) await attachNote();
      await repo.transition(lead.id, to, "human");
      toast.success(`Marcado: ${STATUS_META[to].label}.`);
      setNote("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao mudar status");
    } finally {
      setBusy(false);
    }
  };

  const saveNoteOnly = async () => {
    if (!note.trim()) return;
    setBusy(true);
    try {
      await attachNote();
      toast.success("Registrado na linha do tempo.");
      setNote("");
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar nota");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 rounded-[10px] border border-border bg-surface-2 p-2.5">
      <input
        type="text"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="O que aconteceu? (opcional)"
        disabled={busy}
        className="w-full rounded-[8px] border border-border-2 bg-card px-2.5 py-1.5 text-[12.5px] outline-none focus:border-brand disabled:opacity-50"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {targets.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => move(s)}
            disabled={busy}
            className={`rounded-full border px-2.5 py-1 text-[11.5px] font-semibold transition-colors disabled:opacity-50 ${chipTone(s)}`}
          >
            {STATUS_META[s].label}
          </button>
        ))}
        {note.trim() && (
          <button
            type="button"
            onClick={saveNoteOnly}
            disabled={busy}
            className="ml-auto rounded-full border border-border-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 hover:text-brand disabled:opacity-50"
          >
            Só registrar
          </button>
        )}
      </div>
      {targets.length === 0 && !note.trim() && (
        <p className="mt-1.5 text-[11.5px] text-faint">Sem ações rápidas pra esse status.</p>
      )}
    </div>
  );
}
