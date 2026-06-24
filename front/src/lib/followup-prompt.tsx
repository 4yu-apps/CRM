"use client";
// #1 — Follow-up auto-sugerido ao marcar "Enviado".
// Depois que o lead vira "enviado" (na fila ou no celular), oferece em 1 toque
// "te lembro de cobrar em N dias?" setando followup_at. Continua manual: so
// agenda o lembrete, nunca dispara mensagem. Reusa a logica do followup-card.
import { toast } from "sonner";
import type { LeadsRepo } from "./repo";
import type { Lead } from "./types";

// Opcoes rapidas (dias). +3d e o default recomendado (primeiro da lista).
const OPCOES = [3, 2, 5];

// Data N dias a frente, fixada ao meio-dia local (nao escorrega de dia no ISO/UTC).
function emDias(days: number): string {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

/**
 * Mostra um toast com chips pra agendar o follow-up em 1 toque.
 * No-op se o lead ja tem follow-up agendado.
 */
export function promptFollowupSuggestion(opts: {
  lead: Lead;
  repo: LeadsRepo;
  onSaved?: () => void | Promise<void>;
}) {
  const { lead, repo, onSaved } = opts;
  if (lead.followup_at) return; // ja tem lembrete

  const nome = lead.business_name ?? "esse lead";

  toast.custom(
    (id) => (
      <div className="w-[340px] max-w-full rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow-lg)]">
        <div className="text-[13.5px] font-semibold text-ink">
          Quer que eu te lembre de cobrar {nome}?
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Agendo um follow-up. Você ainda envia pelo seu WhatsApp.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {OPCOES.map((d) => (
            <button
              key={d}
              type="button"
              onClick={async () => {
                try {
                  await repo.update(lead.id, { followup_at: emDias(d) });
                  toast.dismiss(id);
                  toast.success(`Beleza, te lembro em ${d} dias.`);
                  await onSaved?.();
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Erro ao agendar follow-up");
                }
              }}
              className="rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-ink-2 transition-colors hover:border-brand/50 hover:bg-brand-50 hover:text-brand"
            >
              +{d}d
            </button>
          ))}
          <button
            type="button"
            onClick={() => toast.dismiss(id)}
            className="ml-auto rounded-full px-2.5 py-1 text-xs font-semibold text-faint hover:text-ink-2"
          >
            Agora não
          </button>
        </div>
      </div>
    ),
    { duration: 9000 }
  );
}
