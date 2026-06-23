"use client";
// Bloco de follow-up da ficha: agenda quando re-abordar um lead que nao respondeu
// e guarda a mensagem do toque. Alimenta os badges do kanban e o lembrete da tela
// Inicio. Componente fechado: faz o proprio update no repo e avisa o pai (onSaved).
import { useState } from "react";
import { toast } from "sonner";
import { BellRinging, Sparkle } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import type { Lead } from "@/lib/types";

// Cadencia sugerida de follow-up (dias a partir de hoje).
const CADENCIA = [1, 3, 5, 7, 10];

// Data N dias a frente, fixada ao meio-dia local pra nao escorregar de dia ao
// converter pra ISO/UTC.
function emDias(days: number): Date {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d;
}

function mesmoDia(a: Date, b: Date): boolean {
  return a.toDateString() === b.toDateString();
}

function fmtDia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function FollowupCard({
  lead,
  onSaved,
}: {
  lead: Lead;
  onSaved: () => void | Promise<void>;
}) {
  const repo = getRepo();
  const [at, setAt] = useState<string | null>(lead.followup_at ?? null);
  const [note, setNote] = useState(lead.followup_note ?? "");
  const [saving, setSaving] = useState(false);

  const jaTinha = lead.followup_at != null;

  const salvar = async () => {
    if (!at) {
      toast.warning("Escolha em quantos dias re-abordar.");
      return;
    }
    setSaving(true);
    try {
      await repo.update(lead.id, { followup_at: at, followup_note: note.trim() || null });
      toast.success("Follow-up agendado.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar follow-up");
    } finally {
      setSaving(false);
    }
  };

  const remover = async () => {
    setSaving(true);
    try {
      await repo.update(lead.id, { followup_at: null, followup_note: null });
      setAt(null);
      setNote("");
      toast.success("Follow-up removido.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover follow-up");
    } finally {
      setSaving(false);
    }
  };

  const sugerirMensagem = () => {
    const nome = lead.owner_name?.split(" ")[0];
    const ola = nome ? `oi ${nome}, tudo bem?` : "oi, tudo bem?";
    setNote(
      `${ola} voltei aqui rapidinho pra saber se voce chegou a ver minha ultima mensagem. se fizer sentido eu te mostro como ficaria na pratica, sem compromisso.`,
    );
  };

  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
        <BellRinging size={14} weight="fill" /> Follow-up
      </div>
      <p className="mb-2.5 text-[13px] text-muted-foreground">
        Nao respondeu ainda? Marque o dia de voltar e eu te lembro no Inicio e no funil.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {CADENCIA.map((days) => {
          const d = emDias(days);
          const iso = d.toISOString();
          const selecionado = at ? mesmoDia(new Date(at), d) : false;
          return (
            <button
              key={days}
              type="button"
              onClick={() => setAt(iso)}
              className={[
                "rounded-full border px-3 py-1 text-xs font-semibold transition-colors",
                selecionado
                  ? "border-brand bg-brand text-white"
                  : "border-border bg-card text-ink-2 hover:border-brand/50 hover:bg-brand-50 hover:text-brand",
              ].join(" ")}
            >
              +{days}d
            </button>
          );
        })}
      </div>

      {at && (
        <p className="mt-2 text-[12px] text-muted-foreground">
          Voltar em <strong className="text-ink">{fmtDia(at)}</strong>
        </p>
      )}

      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between">
          <label className="text-[11px] font-semibold uppercase tracking-wider text-faint">
            Mensagem do follow-up
          </label>
          <button
            type="button"
            onClick={sugerirMensagem}
            className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
          >
            <Sparkle size={12} weight="fill" /> Sugerir
          </button>
        </div>
        <textarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Ex: oi, tudo bem? so passando pra saber se voce viu minha mensagem..."
          rows={3}
          className="w-full resize-none rounded-xl border border-border-2 bg-card px-3 py-2 text-sm outline-none focus:border-brand"
        />
      </div>

      <div className="mt-3 flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={saving || !at}
          className="rounded-[12px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--grad)" }}
        >
          {saving ? "Salvando..." : jaTinha ? "Atualizar follow-up" : "Agendar follow-up"}
        </button>
        {jaTinha && (
          <button
            type="button"
            onClick={remover}
            disabled={saving}
            className="rounded-[12px] border border-border-2 px-4 py-2 text-sm font-semibold text-ink-2 hover:text-danger disabled:opacity-50"
          >
            Remover
          </button>
        )}
      </div>
    </div>
  );
}
