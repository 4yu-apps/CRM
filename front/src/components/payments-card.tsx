"use client";
// Recebimentos na ficha: o que entrou, quando, e ate quando o contrato esta pago.
//
// O bloco do negocio logo acima responde "quanto foi combinado". Este responde
// "quanto entrou", que e outra pergunta e ate agora nao tinha onde ser feita: o
// dono olhava o CRM, via R$1.500 de MRR, e nao tinha como saber que aquele
// cliente parou de pagar em marco.
//
// Fica silencioso enquanto ninguem registrou nada. Cliente sem recebimento
// registrado NAO e cliente em atraso, e um bloco vermelho na ficha de toda a
// carteira no dia do deploy seria alarme falso em massa.
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { CurrencyCircleDollar, Plus, Trash, CheckCircle, WarningCircle } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { parseBRL, todayInput, parseDateOnly } from "@/lib/format";
import { nextCoverUntil } from "@/lib/payments";
import { daysOverdue, TOLERANCIA_DIAS } from "@/lib/clients";
import { cn } from "@/lib/utils";
import type { Lead, LeadPayment } from "@/lib/types";

const fmtBRL = (v: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);

const fmtDia = (d: string) => {
  const dt = parseDateOnly(d);
  return dt ? dt.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" }) : d;
};

export function PaymentsCard({ lead, onSaved }: { lead: Lead; onSaved: () => void | Promise<void> }) {
  const repo = getRepo();
  const [pagamentos, setPagamentos] = useState<LeadPayment[] | null>(null);
  const [abrindo, setAbrindo] = useState(false);
  const [salvando, setSalvando] = useState(false);

  const [valor, setValor] = useState("");
  const [recebidoEm, setRecebidoEm] = useState(todayInput());
  const [cobreAte, setCobreAte] = useState("");
  const [nota, setNota] = useState("");

  const carregar = useCallback(async () => {
    try {
      setPagamentos(await repo.listPayments(lead.id));
    } catch {
      // Lista de recebimentos que nao carrega nao pode derrubar a ficha inteira.
      setPagamentos([]);
    }
  }, [repo, lead.id]);

  useEffect(() => {
    // fetch-on-mount: carrega o historico ao abrir/trocar de lead. Mesmo padrao
    // do LeadFiles.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void carregar();
  }, [carregar]);

  const atraso = daysOverdue(lead);
  const emAtraso = atraso !== null && atraso > TOLERANCIA_DIAS;
  const total = (pagamentos ?? []).reduce((s, p) => s + p.amount, 0);
  const acompanha = !!lead.paid_until || (pagamentos?.length ?? 0) > 0;

  const abrir = () => {
    // Pre-preenche com o combinado e com o proximo mes a cobrir: o caso comum e
    // "recebi o de sempre, no valor de sempre", e isso deve ser um clique.
    setValor(lead.deal_value != null ? String(lead.deal_value) : "");
    setRecebidoEm(todayInput());
    setCobreAte(nextCoverUntil(lead));
    setNota("");
    setAbrindo(true);
  };

  const salvar = async () => {
    const num = parseBRL(valor);
    if (num == null || num <= 0) {
      toast.warning("Informe quanto entrou.");
      return;
    }
    setSalvando(true);
    try {
      await repo.addPayment(lead.id, {
        amount: num,
        paid_on: recebidoEm || undefined,
        // Vazio de proposito e informacao: recebimento avulso nao estende a
        // cobertura do contrato, e nao pode fingir que estende.
        covers_until: cobreAte || null,
        note: nota.trim() || null,
      });
      toast.success("Recebimento registrado.");
      setAbrindo(false);
      await carregar();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao registrar o recebimento");
    } finally {
      setSalvando(false);
    }
  };

  const apagar = async (p: LeadPayment) => {
    try {
      await repo.deletePayment(p.id);
      toast.success("Recebimento removido.");
      await carregar();
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover");
    }
  };

  // ----- Convite: ninguem acompanha recebimento desse cliente ainda -----
  if (!acompanha && !abrindo) {
    return (
      <div className="rounded-[14px] border border-dashed border-border p-4">
        <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
          <CurrencyCircleDollar size={14} /> Recebimentos
        </div>
        <p className="mb-3 text-[13px] text-muted-foreground">
          O valor acima é o que foi combinado. Registrando o que entra, o CRM passa a avisar quando
          esse cliente atrasa e Resultados mostra recebido do lado de contratado.
        </p>
        <button
          type="button"
          onClick={abrir}
          className="rounded-[12px] border border-brand bg-brand-50 px-4 py-2 text-sm font-bold text-brand"
        >
          Registrar recebimento
        </button>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-[14px] border p-4",
        emAtraso ? "border-danger/30 bg-danger-bg" : "border-border bg-surface-2",
      )}
    >
      <div className="mb-2 flex items-center justify-between gap-2">
        <div
          className={cn(
            "flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider",
            emAtraso ? "text-danger" : "text-faint",
          )}
        >
          <CurrencyCircleDollar size={14} /> Recebimentos
        </div>
        {!abrindo && (
          <button
            type="button"
            onClick={abrir}
            className="flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
          >
            <Plus size={12} weight="bold" /> Recebi
          </button>
        )}
      </div>

      {/* Estado da cobertura: a linha que responde "esse cliente esta em dia?" */}
      {lead.paid_until && (
        <div className="mb-2 flex items-center gap-1.5 text-[13px]">
          {emAtraso ? (
            <>
              <WarningCircle size={15} weight="fill" className="flex-none text-danger" />
              <span className="font-semibold text-danger">
                {atraso}d sem pagar
              </span>
              <span className="text-faint">· pago até {fmtDia(lead.paid_until)}</span>
            </>
          ) : (
            <>
              <CheckCircle size={15} weight="fill" className="flex-none text-success" />
              <span className="font-semibold text-ink">Pago até {fmtDia(lead.paid_until)}</span>
            </>
          )}
        </div>
      )}

      {total > 0 && (
        <div className="mb-2 text-[13px] text-muted-foreground">
          <strong className="text-ink">{fmtBRL(total)}</strong> recebido no total
        </div>
      )}

      {/* ----- Formulario ----- */}
      {abrindo && (
        <div className="mt-3 flex flex-col gap-3 rounded-[12px] border border-brand-100 bg-card p-3">
          <div>
            <label
              htmlFor="pay-valor"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint"
            >
              Quanto entrou (R$)
            </label>
            <input
              id="pay-valor"
              type="text"
              inputMode="decimal"
              autoFocus
              placeholder="Ex: 1500"
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <label
                htmlFor="pay-quando"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint"
              >
                Recebido em
              </label>
              <input
                id="pay-quando"
                type="date"
                value={recebidoEm}
                onChange={(e) => setRecebidoEm(e.target.value)}
                className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
            </div>
            <div className="flex-1">
              <label
                htmlFor="pay-cobre"
                className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint"
              >
                Cobre até
              </label>
              <input
                id="pay-cobre"
                type="date"
                value={cobreAte}
                onChange={(e) => setCobreAte(e.target.value)}
                className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
              />
              <p className="mt-1 text-[12px] text-faint">
                Deixe vazio se for avulso. É daqui que sai o alerta de atraso.
              </p>
            </div>
          </div>

          <div>
            <label
              htmlFor="pay-nota"
              className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint"
            >
              Observação (opcional)
            </label>
            <input
              id="pay-nota"
              type="text"
              placeholder="Ex: pix, com desconto de 10%"
              value={nota}
              onChange={(e) => setNota(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-card px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
            />
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={salvar}
              disabled={salvando}
              className="rounded-[12px] px-4 py-2 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--grad)" }}
            >
              {salvando ? "Salvando..." : "Salvar"}
            </button>
            <button
              type="button"
              onClick={() => setAbrindo(false)}
              disabled={salvando}
              className="rounded-[12px] border border-border-2 px-4 py-2 text-sm font-semibold text-ink-2 disabled:opacity-50"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ----- Historico ----- */}
      {(pagamentos?.length ?? 0) > 0 && (
        <ul className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          {pagamentos!.map((p) => (
            <li key={p.id} className="group flex items-center gap-2 text-[13px]">
              <span className="font-semibold tabular-nums text-ink">{fmtBRL(p.amount)}</span>
              <span className="text-faint">em {fmtDia(p.paid_on)}</span>
              {p.covers_until && (
                <span className="text-faint">· cobre até {fmtDia(p.covers_until)}</span>
              )}
              {p.note && <span className="truncate text-muted-foreground">· {p.note}</span>}
              {/* Afordancia revelada no hover no desktop, sempre visivel no
                  toque: opacity-0 continua clicavel pro Playwright e invisivel
                  pro dedo, e foi assim que um botao ficou inalcancavel no
                  celular antes. */}
              <button
                type="button"
                onClick={() => apagar(p)}
                aria-label={`Remover recebimento de ${fmtBRL(p.amount)}`}
                className="ml-auto flex-none text-faint opacity-100 transition-opacity hover:text-danger sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100"
              >
                <Trash size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
