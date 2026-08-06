"use client";
// Bloco do negocio na ficha: quanto foi cobrado, como e desde quando.
//
// Antes isso era so leitura, e o valor so entrava pelo modal do kanban ao
// arrastar o card pra "Fechou". Quem digitava errado nao tinha como corrigir, e
// quem fechou por fora nunca via o bloco. Agora aparece sempre que o lead esta
// fechado (mesmo vazio, convidando) e edita no lugar.
//
// Componente fechado, no mesmo molde do FollowupCard: faz o proprio update no
// repo e avisa o pai (onSaved).
import { useState } from "react";
import { toast } from "sonner";
import { CheckCircle, CurrencyCircleDollar, PencilSimple } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { parseBRL, toDateInput, fromDateInput, todayInput } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DealBilling, Lead } from "@/lib/types";

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function billingLabel(billing: DealBilling | null | undefined, months: number | null | undefined): string {
  if (billing === "por_prazo") return `Por prazo${months ? ` (${months} meses)` : ""}`;
  if (billing === "mensal_fixo") return "Mensal fixo";
  return "Cobrança não informada";
}

function fmtDia(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export function DealCard({ lead, onSaved }: { lead: Lead; onSaved: () => void | Promise<void> }) {
  const repo = getRepo();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [value, setValue] = useState(lead.deal_value != null ? String(lead.deal_value) : "");
  const [billing, setBilling] = useState<DealBilling>(lead.deal_billing ?? "mensal_fixo");
  const [months, setMonths] = useState(lead.deal_term_months != null ? String(lead.deal_term_months) : "");
  const [closedAt, setClosedAt] = useState(toDateInput(lead.deal_closed_at));

  const temValor = lead.deal_value != null;
  // Negocio ja registrado num lead que voltou pro funil (fechado -> reuniao, por
  // exemplo). O valor continua valendo como historico, mas chamar de "fechado"
  // seria mentira.
  const reaberto = temValor && lead.status !== "fechado";
  const lido = parseBRL(value);

  const abrirEdicao = () => {
    setValue(lead.deal_value != null ? String(lead.deal_value) : "");
    setBilling(lead.deal_billing ?? "mensal_fixo");
    setMonths(lead.deal_term_months != null ? String(lead.deal_term_months) : "");
    // Sem data ainda? Propoe hoje. Quase sempre e o dia em que a pessoa registra.
    setClosedAt(toDateInput(lead.deal_closed_at) || todayInput());
    setEditing(true);
  };

  const salvar = async () => {
    const num = parseBRL(value);
    if (num == null || num <= 0) {
      toast.warning("Informe quanto você cobrou.");
      return;
    }
    let termMonths: number | null = null;
    if (billing === "por_prazo") {
      const m = Number.parseInt(months, 10);
      if (!Number.isFinite(m) || m <= 0) {
        toast.warning("Contrato por prazo precisa do número de meses.");
        return;
      }
      termMonths = m;
    }
    const dataIso = fromDateInput(closedAt);
    if (closedAt && !dataIso) {
      toast.warning("Data do fechamento inválida.");
      return;
    }

    setSaving(true);
    try {
      await repo.update(lead.id, {
        deal_value: num,
        deal_billing: billing,
        // Mensal fixo nao tem prazo. Deixar o numero antigo aqui e guardar dado
        // que contradiz o proprio registro.
        deal_term_months: termMonths,
        deal_closed_at: dataIso,
      });
      toast.success("Negócio atualizado.");
      setEditing(false);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar o negócio");
    } finally {
      setSaving(false);
    }
  };

  // ----- Vazio: o lead esta fechado e ninguem disse quanto cobrou -----
  if (!temValor && !editing) {
    return (
      <div className="rounded-[14px] border border-dashed border-border p-4">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
          <CurrencyCircleDollar size={14} /> Negócio fechado
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">
          Você fechou com esse cliente mas não registrou o valor. Sem ele, Resultados e Clientes contam um cliente a
          mais e nenhum real a mais.
        </p>
        <button
          type="button"
          onClick={abrirEdicao}
          className="rounded-[12px] border border-brand bg-brand-50 px-4 py-2 text-sm font-bold text-brand"
        >
          Registrar valor
        </button>
      </div>
    );
  }

  // ----- Leitura -----
  if (!editing) {
    return (
      <div
        className={cn(
          "rounded-[14px] border p-4",
          reaberto ? "border-border bg-surface-2" : "border-success/30 bg-success-bg",
        )}
      >
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <div
            className={cn(
              "flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider",
              reaberto ? "text-faint" : "text-success",
            )}
          >
            <CheckCircle size={14} weight="fill" /> {reaberto ? "Negócio reaberto" : "Negócio fechado"}
          </div>
          <button
            type="button"
            onClick={abrirEdicao}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
          >
            <PencilSimple size={12} /> Editar
          </button>
        </div>
        <div className="text-xl font-bold text-ink">{fmtBRL(lead.deal_value ?? 0)}</div>
        <div className="mt-1 text-[13px] text-muted-foreground">
          {billingLabel(lead.deal_billing, lead.deal_term_months)}
          {lead.deal_closed_at && <span className="ml-2 text-faint">em {fmtDia(lead.deal_closed_at)}</span>}
        </div>
        {reaberto && (
          <p className="mt-2 text-[12px] text-faint">
            Esse lead voltou pro funil. O valor fica aqui como histórico do que já foi fechado uma vez.
          </p>
        )}
      </div>
    );
  }

  // ----- Edicao -----
  return (
    <div className="rounded-[14px] border border-brand-100 bg-surface-2 p-4">
      <div className="mb-3 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
        <CurrencyCircleDollar size={14} /> {temValor ? "Editar negócio" : "Registrar negócio"}
      </div>

      <div className="flex flex-col gap-3.5">
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
            Quanto você cobrou (R$)
          </label>
          {lead.suggested_value != null && (
            <p className="mb-1.5 text-[12px] text-muted-foreground">
              A IA sugeriu <strong className="text-ink">{fmtBRL(lead.suggested_value)}</strong>
            </p>
          )}
          <input
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="Ex: 1500"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
          {/* Eco do que vai pro banco: "2.500,00" e "2500" viram o mesmo numero,
              e o dono confere isso antes de salvar. */}
          {lido != null && lido > 0 && (
            <p className="mt-1.5 text-[12px] text-muted-foreground">
              Vou salvar <strong className="text-ink">{fmtBRL(lido)}</strong>
            </p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
            Tipo de cobrança
          </label>
          <div className="flex gap-2">
            {(["mensal_fixo", "por_prazo"] as DealBilling[]).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => setBilling(opt)}
                className={cn(
                  "flex-1 rounded-xl border px-3 py-2.5 text-sm font-semibold transition-colors",
                  billing === opt
                    ? "border-brand bg-brand-50 text-brand"
                    : "border-border-2 bg-card text-ink-2 hover:border-brand/50",
                )}
              >
                {opt === "mensal_fixo" ? "Mensal fixo" : "Por prazo"}
              </button>
            ))}
          </div>
        </div>

        {billing === "por_prazo" && (
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Meses de contrato
            </label>
            <input
              type="number"
              min={1}
              placeholder="Ex: 6"
              value={months}
              onChange={(e) => setMonths(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
            <p className="mt-1 text-[12px] text-faint">É daqui que sai o alerta de renovação em Clientes.</p>
          </div>
        )}

        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
            Fechado em
          </label>
          <input
            type="date"
            value={closedAt}
            onChange={(e) => setClosedAt(e.target.value)}
            className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={salvar}
          disabled={saving}
          className="rounded-[12px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
          style={{ background: "var(--grad)" }}
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={saving}
          className="rounded-[12px] border border-border-2 px-4 py-2 text-sm font-semibold text-ink-2 disabled:opacity-50"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}
