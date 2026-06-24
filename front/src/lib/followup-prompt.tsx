"use client";
// #1 -- Follow-up auto-sugerido ao marcar "Enviado".
// Depois que o lead vira "enviado" (na fila ou no celular), oferece em 1 toque
// "te lembro de cobrar em N dias?" setando followup_at. Continua manual: so
// agenda o lembrete, nunca dispara mensagem. Reusa a logica do followup-card.
import { toast } from "sonner";
import type { LeadsRepo } from "./repo";
import type { Lead } from "./types";
import { proximoToque, dataSugerida, CADENCE } from "./cadence";

/**
 * Mostra um toast com chips pra agendar o follow-up em 1 toque.
 * Usa a cadencia definida em cadence.ts. No-op se o lead ja tem follow-up agendado.
 * Ao aceitar, grava cadence_step = 1 e followup_at com a data do proximo toque.
 */
export function promptFollowupSuggestion(opts: {
  lead: Lead;
  repo: LeadsRepo;
  onSaved?: () => void | Promise<void>;
}) {
  const { lead, repo, onSaved } = opts;
  if (lead.followup_at) return; // ja tem lembrete

  const nome = lead.business_name ?? "esse lead";

  // Passo atual: se o lead ja tem cadence_step, usar; caso contrario comecar do 0.
  const stepAtual = lead.cadence_step ?? 0;
  // Proximo toque a partir do step atual (step 0 -> proximo e step 1 = abertura ja feita, pula p/ step 2).
  // Na pratica ao marcar "enviado", step e 0 ou null, entao proximo = step 2 (1o follow-up).
  const prox = proximoToque(Math.max(stepAtual, 1)) ?? CADENCE[CADENCE.length - 1];
  const dataProx = dataSugerida(prox);
  const diasProx = prox.dias;
  const rotuloProx = prox.rotulo;

  toast.custom(
    (id) => (
      <div className="w-[340px] max-w-full rounded-[14px] border border-border bg-card p-4 shadow-[var(--shadow-lg)]">
        <div className="text-[13.5px] font-semibold text-ink">
          Quer que eu te lembre de cobrar {nome}?
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Agendo o {rotuloProx.toLowerCase()} em {diasProx}d. Você ainda envia pelo seu WhatsApp.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={async () => {
              try {
                await repo.update(lead.id, {
                  followup_at: dataProx.toISOString(),
                  cadence_step: Math.max(stepAtual, 1),
                });
                toast.dismiss(id);
                toast.success(`Beleza, te lembro do ${rotuloProx.toLowerCase()} em ${diasProx}d.`);
                await onSaved?.();
              } catch (e) {
                toast.error(e instanceof Error ? e.message : "Erro ao agendar follow-up");
              }
            }}
            className="rounded-full border border-brand bg-brand-50 px-3 py-1 text-xs font-bold text-brand transition-colors hover:bg-brand hover:text-white"
          >
            +{diasProx}d ({rotuloProx})
          </button>
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
