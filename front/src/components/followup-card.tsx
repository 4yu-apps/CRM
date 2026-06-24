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
import { CADENCE, proximoToque, dataSugerida } from "@/lib/cadence";

// Opcoes rapidas de follow-up avulso (dias a partir de hoje), fora da regua.
const CADENCIA_AVULSA = [1, 3, 5, 7, 10];

// Total de toques na regua (derivado do CADENCE central).
const REGUA_TOTAL = CADENCE.length;

// Sentinel: valor de cadence_step que indica cadencia CONCLUIDA.
// Usa REGUA_TOTAL + 1 para nao colidir com o ultimo passo valido (REGUA_TOTAL).
const CADENCE_DONE = REGUA_TOTAL + 1;

// Sugestoes de mensagem por passo da cadencia.
// Indice 0 = sugestao ao agendar o 2o toque (step 2), etc.
const REGUA_MSGS = [
  // sugestao p/ o 2o toque (step 2, 1o follow-up)
  "voltei aqui rapidinho pra saber se você chegou a ver minha última mensagem. se fizer sentido, te mostro como ficaria na prática, sem compromisso.",
  // sugestao p/ o 3o toque (step 3, 2o follow-up)
  "só passando pra verificar se rolou alguma dúvida sobre o que conversei com você antes. qualquer coisa estou aqui.",
  // sugestao p/ o 4o toque (step 4, ultimo toque)
  "prometo que é a última vez que insisto por aqui. se não for o momento agora, sem problema, é só me avisar que eu paro.",
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

  // ----- Cadencia multi-toque (cadence.ts) -----
  // cadence_step semantica:
  //   0            = nao iniciada
  //   1..REGUA_TOTAL = step atual da cadencia (step N = toques 1..N agendados/feitos)
  //   CADENCE_DONE   = cadencia encerrada (todos os toques concluidos)
  const step = lead.cadence_step ?? 0;

  const olaDe = () => {
    const nome = lead.owner_name?.split(" ")[0];
    return nome ? `oi ${nome}, ` : "oi, ";
  };

  const iniciarRegua = async () => {
    setSaving(true);
    try {
      // Passo 1 (abertura) foi feito. Agendar passo 2 (1o follow-up).
      const prox = proximoToque(1);
      if (!prox) {
        toast.error("Cadencia nao configurada.");
        return;
      }
      const novoAt = dataSugerida(prox).toISOString();
      const msg = olaDe() + (REGUA_MSGS[0] ?? "");
      await repo.update(lead.id, {
        cadence_step: 1,
        followup_at: novoAt,
        followup_note: msg,
      });
      setAt(novoAt);
      setNote(msg);
      toast.success(`Cadência iniciada. Agendei o ${prox.rotulo.toLowerCase()} para ${fmtDia(novoAt)}.`);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao iniciar cadência");
    } finally {
      setSaving(false);
    }
  };

  const concluirToque = async () => {
    setSaving(true);
    try {
      const prox = proximoToque(step);
      if (!prox) {
        // Nao ha proximo toque: marcar cadencia como concluida
        await repo.update(lead.id, {
          cadence_step: CADENCE_DONE,
          followup_at: null,
          followup_note: null,
        });
        setAt(null);
        setNote("");
        toast.success(`Fim da cadência. Os ${REGUA_TOTAL} toques foram dados.`);
      } else {
        const novoAt = dataSugerida(prox).toISOString();
        // Mensagem sugerida para o proximo toque (REGUA_MSGS[step-1] onde step = toques feitos)
        const msg = olaDe() + (REGUA_MSGS[step - 1] ?? REGUA_MSGS[REGUA_MSGS.length - 1]);
        // Avancar cadence_step para o proximo passo: significa "N toques feitos, agendei N+1"
        await repo.update(lead.id, {
          cadence_step: prox.step,
          followup_at: novoAt,
          followup_note: msg,
        });
        setAt(novoAt);
        setNote(msg);
        toast.success(`Toque registrado. Agendei o ${prox.rotulo.toLowerCase()} para ${fmtDia(novoAt)}.`);
      }
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao avançar a cadência");
    } finally {
      setSaving(false);
    }
  };

  const pararCadencia = async () => {
    setSaving(true);
    try {
      await repo.update(lead.id, { cadence_step: 0 });
      toast.message("Cadência interrompida. O follow-up agendado continua.");
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao parar cadência");
    } finally {
      setSaving(false);
    }
  };

  // Rotulo do toque atual (ex: "1º follow-up de 4")
  const cadenceItem = CADENCE.find((c) => c.step === step);
  const rotuloAtual = cadenceItem
    ? `${cadenceItem.rotulo} (${step} de ${REGUA_TOTAL})`
    : `Toque ${step} de ${REGUA_TOTAL}`;

  // Proximo toque (para hint de "ao concluir, agendarei X")
  const proxToque = step > 0 && step < CADENCE_DONE ? proximoToque(step) : null;

  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
        <BellRinging size={14} weight="fill" /> Follow-up
      </div>
      <p className="mb-2.5 text-[13px] text-muted-foreground">
        Nao respondeu ainda? Marque o dia de voltar e eu te lembro no Inicio e no funil.
      </p>

      <div className="flex flex-wrap gap-1.5">
        {CADENCIA_AVULSA.map((days) => {
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

      {/* Cadencia multi-toque (cadence.ts) */}
      <div className="mt-4 border-t border-border pt-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
          <ArrowsClockwise size={14} weight="bold" /> Cadencia de {REGUA_TOTAL} toques
        </div>

        {step === 0 ? (
          <>
            <p className="mb-2.5 text-[12px] text-muted-foreground">
              Sequência: Abertura · +2d · +5d · +12d. Ao concluir um toque, agendo o próximo. Você sempre envia pelo seu WhatsApp.
            </p>
            <button
              type="button"
              onClick={iniciarRegua}
              disabled={saving}
              className="rounded-[12px] border border-brand bg-brand-50 px-4 py-2 text-sm font-bold text-brand disabled:opacity-50"
            >
              Iniciar cadência de {REGUA_TOTAL} toques
            </button>
          </>
        ) : step >= CADENCE_DONE ? (
          <div className="flex items-center justify-between gap-2">
            <span className="text-[13px] font-semibold text-success">
              Fim da cadência · {REGUA_TOTAL} toques dados
            </span>
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
              {CADENCE.map((c) => (
                <span
                  key={c.step}
                  className={cn("h-1.5 flex-1 rounded-full", c.step <= step ? "bg-brand" : "bg-border")}
                />
              ))}
            </div>
            <p className="text-[12px] text-muted-foreground">
              <span className="font-semibold text-ink">{rotuloAtual}</span> em andamento.
              {lead.followup_at && (
                <>
                  {" "}
                  Agendado para <strong className="text-ink">{fmtDia(lead.followup_at)}</strong>.
                </>
              )}
            </p>
            {proxToque && (
              <p className="mt-0.5 text-[11px] text-faint">
                Ao concluir: agendarei o {proxToque.rotulo.toLowerCase()} automaticamente.
              </p>
            )}
            {!proxToque && step > 0 && step < CADENCE_DONE && (
              <p className="mt-0.5 text-[11px] text-faint">
                Este é o último toque. Ao concluir, a cadência se encerra.
              </p>
            )}
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
                onClick={pararCadencia}
                disabled={saving}
                className="rounded-[12px] border border-border-2 px-3 py-2 text-sm font-semibold text-ink-2 hover:text-danger disabled:opacity-50"
              >
                Parar cadência
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
