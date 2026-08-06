"use client";
// Registrar a saida de um cliente.
//
// Nao passa pelo funil de proposito. Cliente que cancela nao e lead perdido:
// aquele nunca chegou a fechar, este fechou, faturou e foi embora. Misturar os
// dois sujaria a taxa de fechamento, que existe pra medir prospeccao.
//
// O motivo e obrigatorio porque e a unica parte do churn que ensina alguma
// coisa. "Perdi 3 clientes" nao muda uma decisao; "perdi 3 por preco" muda.
import { useState } from "react";
import { toast } from "sonner";
import { X, ArrowBendUpLeft } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { fromDateInput, todayInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";

const MOTIVOS = [
  "Preço",
  "Não viu resultado",
  "Trocou de fornecedor",
  "Fechou ou parou a empresa",
  "Ficou interno",
];

export function ChurnModal({
  lead,
  onClose,
  onDone,
}: {
  lead: Lead;
  onClose: () => void;
  onDone: () => void | Promise<void>;
}) {
  const repo = getRepo();
  const [motivo, setMotivo] = useState("");
  const [outro, setOutro] = useState("");
  const [dia, setDia] = useState(todayInput);
  const [salvando, setSalvando] = useState(false);

  const escolhido = motivo === "Outro" ? outro.trim() : motivo;

  const registrar = async () => {
    if (!escolhido) {
      toast.warning("Diga por que ele saiu. É a parte que ensina alguma coisa.");
      return;
    }
    const iso = fromDateInput(dia);
    if (!iso) {
      toast.warning("Data de saída inválida.");
      return;
    }
    setSalvando(true);
    try {
      // Campos primeiro, status depois: se a transicao falhar, o motivo nao fica
      // gravado num cliente que continua ativo.
      await repo.update(lead.id, { churn_at: iso, churn_reason: escolhido });
      await repo.transition(lead.id, "cancelado", "human", escolhido);
      toast.success(`${lead.business_name ?? "Cliente"} saiu da carteira.`);
      onClose();
      await onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar a saída");
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div
      onClick={() => { if (!salvando) onClose(); }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-4 backdrop-blur-[2px] sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[calc(100dvh-2rem)] w-[440px] max-w-full flex-col overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
        style={{ animation: "fadeUp .25s both" }}
      >
        <div className="flex flex-none items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-danger-bg text-danger">
              <ArrowBendUpLeft size={20} weight="bold" />
            </div>
            <div>
              <div className="text-base font-bold">Cliente saiu</div>
              <div className="text-[12.5px] text-muted-foreground">{lead.business_name ?? "Cliente"}</div>
            </div>
          </div>
          <button onClick={onClose} disabled={salvando} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Por que saiu
            </label>
            <div className="flex flex-wrap gap-1.5">
              {[...MOTIVOS, "Outro"].map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMotivo(m)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-[12.5px] font-semibold transition-colors",
                    motivo === m
                      ? "border-brand bg-brand text-white"
                      : "border-border-2 bg-surface-2 text-ink-2 hover:border-brand/50",
                  )}
                >
                  {m}
                </button>
              ))}
            </div>
            {motivo === "Outro" && (
              <input
                autoFocus
                value={outro}
                onChange={(e) => setOutro(e.target.value)}
                placeholder="Em poucas palavras"
                className="mt-2.5 w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Saiu em
            </label>
            <input
              type="date"
              value={dia}
              max={todayInput()}
              onChange={(e) => setDia(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <p className="text-[12px] text-faint">
            Ele sai do MRR e vai pra aba Encerrados. Nada é apagado, e dá pra trazer de volta se ele voltar.
          </p>
        </div>

        <div className="flex flex-none gap-3 border-t border-border px-6 py-5">
          <button
            onClick={onClose}
            disabled={salvando}
            className="flex-1 rounded-[14px] border border-border-2 bg-card p-3.5 text-sm font-semibold text-ink-2 disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            onClick={registrar}
            disabled={salvando}
            className="flex-1 rounded-[14px] bg-danger p-3.5 text-sm font-bold text-white disabled:opacity-60"
          >
            {salvando ? "Salvando..." : "Confirmar saída"}
          </button>
        </div>
      </div>
    </div>
  );
}
