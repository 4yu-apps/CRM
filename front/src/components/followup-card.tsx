"use client";
// Bloco de follow-up da ficha: agenda quando re-abordar um lead que nao respondeu
// e guarda a mensagem do toque. Alimenta os badges do kanban e o lembrete da tela
// Inicio. Componente fechado: faz o proprio update no repo e avisa o pai (onSaved).
import { useState } from "react";
import { toast } from "sonner";
import { BellRinging, Sparkle, ArrowsClockwise } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";

// Cadencia sugerida de follow-up (dias a partir de hoje).
const CADENCIA = [1, 3, 5, 7, 10];

// Regua leve de 3 toques (#2): D0 (envio) -> +3d -> +7d. REGUA_GAPS = dias ate
// o proximo toque, a cada toque concluido. cadence_step (no lead) guarda o
// progresso; a data do proximo toque reusa followup_at.
const REGUA_GAPS = [3, 4];
const REGUA_TOTAL = REGUA_GAPS.length + 1; // 3 toques
const REGUA_MSGS = [
  // sugestao p/ o 2o toque
  "voltei aqui rapidinho pra saber se voce chegou a ver minha ultima mensagem. se fizer sentido, te mostro como ficaria na pratica, sem compromisso.",
  // sugestao p/ o 3o toque
  "prometo que e a ultima vez que insisto por aqui. se nao for o momento agora, sem problema, e so me avisar que eu paro.",
];

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

  // ----- Regua de 3 toques (#2) -----
  const step = lead.cadence_step ?? 0;
  const olaDe = () => {
    const nome = lead.owner_name?.split(" ")[0];
    return nome ? `oi ${nome}, ` : "oi, ";
  };

  const iniciarRegua = async () => {
    setSaving(true);
    try {
      const novoAt = emDias(REGUA_GAPS[0]).toISOString();
      await repo.update(lead.id, {
        cadence_step: 1,
        followup_at: novoAt,
        followup_note: olaDe() + REGUA_MSGS[0],
      });
      setAt(novoAt);
      setNote(olaDe() + REGUA_MSGS[0]);
      toast.success("Régua iniciada. Agendei o 2º toque.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar régua");
    } finally {
      setSaving(false);
    }
  };

  const concluirToque = async () => {
    const proximo = step + 1; // toque que acabou de ser concluido vira o atual
    setSaving(true);
    try {
      if (proximo >= REGUA_TOTAL) {
        await repo.update(lead.id, { cadence_step: REGUA_TOTAL, followup_at: null, followup_note: null });
        setAt(null);
        setNote("");
        toast.success("Régua concluída. Os 3 toques foram dados.");
      } else {
        const novoAt = emDias(REGUA_GAPS[proximo - 1]).toISOString();
        const msg = olaDe() + (REGUA_MSGS[proximo - 1] ?? "");
        await repo.update(lead.id, { cadence_step: proximo, followup_at: novoAt, followup_note: msg });
        setAt(novoAt);
        setNote(msg);
        toast.success(`Toque registrado. Agendei o ${proximo + 1}º toque.`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao avançar a régua");
    } finally {
      setSaving(false);
    }
  };

  const pararRegua = async () => {
    setSaving(true);
    try {
      await repo.update(lead.id, { cadence_step: 0 });
      toast.message("Régua interrompida. O follow-up agendado continua.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao parar régua");
    } finally {
      setSaving(false);
    }
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

      {/* Regua de 3 toques (#2) */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
          <ArrowsClockwise size={14} weight="bold" /> Régua de {REGUA_TOTAL} toques
        </div>

        {step === 0 ? (
          <>
            <p className="mb-2.5 text-[12px] text-muted-foreground">
              Sequência D0 · +3d · +7d. Ao concluir um toque, agendo o próximo sozinho. Você sempre envia pelo seu WhatsApp.
            </p>
            <button
              type="button"
              onClick={iniciarRegua}
              disabled={saving}
              className="rounded-[12px] border border-brand bg-brand-50 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50"
            >
              Iniciar régua de 3 toques
            </button>
          </>
        ) : step >= REGUA_TOTAL ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-success">Régua concluída · 3 toques dados</span>
            <button
              type="button"
              onClick={iniciarRegua}
              disabled={saving}
              className="text-[12px] font-semibold text-brand hover:underline disabled:opacity-50"
            >
              Reiniciar
            </button>
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-1.5">
              {Array.from({ length: REGUA_TOTAL }).map((_, i) => (
                <span
                  key={i}
                  className={cn("h-1.5 flex-1 rounded-full", i < step ? "bg-brand" : "bg-border")}
                />
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">
              Toque {step} de {REGUA_TOTAL} feito.
              {lead.followup_at && (
                <>
                  {" "}
                  Próximo em <strong className="text-ink">{fmtDia(lead.followup_at)}</strong>.
                </>
              )}
            </p>
            <div className="mt-2.5 flex items-center gap-2">
              <button
                type="button"
                onClick={concluirToque}
                disabled={saving}
                className="rounded-[12px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
                style={{ background: "var(--grad)" }}
              >
                {saving ? "Salvando..." : "Concluí esse toque"}
              </button>
              <button
                type="button"
                onClick={pararRegua}
                disabled={saving}
                className="rounded-[12px] border border-border-2 px-3 py-2 text-sm font-semibold text-ink-2 hover:text-danger disabled:opacity-50"
              >
                Parar régua
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
