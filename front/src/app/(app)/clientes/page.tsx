"use client";
// #15 Clientes (pos-fechamento) + #16 reativacao de frios e alerta de renovacao.
// Tudo derivado de status/deal_* existentes (sem schema). Cliente = lead fechado.
import { useMemo } from "react";
import Link from "next/link";
import { Handshake, ArrowClockwise, SmileySad, Warning } from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { isClient, renewalDate, daysUntilRenewal, isColdReactivatable, daysCold } from "@/lib/clients";
import type { Lead } from "@/lib/types";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

function billingLabel(l: Lead): string {
  if (l.deal_billing === "mensal_fixo") return "Mensal fixo";
  if (l.deal_billing === "por_prazo") return `Por prazo${l.deal_term_months ? ` (${l.deal_term_months}m)` : ""}`;
  return "—";
}

function fmtDia(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function ClientesPage() {
  const { leads, loading } = useLeads();

  const clientes = useMemo(
    () =>
      leads
        .filter(isClient)
        .sort((a, b) => +new Date(b.deal_closed_at ?? b.updated_at) - +new Date(a.deal_closed_at ?? a.updated_at)),
    [leads],
  );

  // Renovacoes nos proximos 30 dias (inclui vencidas, p/ nao deixar passar).
  const renovacoes = useMemo(
    () =>
      clientes
        .map((l) => ({ l, dias: daysUntilRenewal(l) }))
        .filter((x): x is { l: Lead; dias: number } => x.dias !== null && x.dias <= 30)
        .sort((a, b) => a.dias - b.dias),
    [clientes],
  );

  const frios = useMemo(
    () => leads.filter((l) => isColdReactivatable(l, 30)).sort((a, b) => daysCold(b) - daysCold(a)),
    [leads],
  );

  const mrr = useMemo(
    () =>
      clientes
        .filter((l) => l.deal_billing === "mensal_fixo")
        .reduce((s, l) => s + (l.deal_value ?? 0), 0),
    [clientes],
  );

  if (loading) {
    return <div className="mx-auto max-w-[1080px] px-1 py-10 text-center text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      {/* topo */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          <p className="text-[13.5px] text-muted-foreground">Quem você fechou, contratos e quem dá pra reaquecer.</p>
        </div>
        <div className="flex gap-3">
          <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center shadow-[var(--shadow)]">
            <div className="font-heading text-[22px] font-bold leading-none">{clientes.length}</div>
            <div className="mt-1 text-[11.5px] text-faint">clientes</div>
          </div>
          <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center shadow-[var(--shadow)]">
            <div className="font-heading text-[22px] font-bold leading-none text-success">{brl(mrr)}</div>
            <div className="mt-1 text-[11.5px] text-faint">MRR contratado</div>
          </div>
        </div>
      </div>

      {/* renovacoes proximas (#16) */}
      {renovacoes.length > 0 && (
        <div className="fu rounded-[18px] border border-amber-300 bg-amber-50 p-5 shadow-[var(--shadow)] dark:border-amber-800 dark:bg-amber-950/30">
          <div className="mb-3 flex items-center gap-2 text-[15px] font-bold text-amber-800 dark:text-amber-300">
            <Warning size={18} weight="fill" /> Renovações próximas
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {renovacoes.map(({ l, dias }) => {
              const r = renewalDate(l);
              return (
                <Link
                  key={l.id}
                  href={`/ficha/${l.id}`}
                  className="flex items-center justify-between gap-2 rounded-[12px] border border-border bg-card px-3.5 py-2.5 transition-colors hover:border-brand"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[13.5px] font-semibold">{l.business_name ?? "Cliente"}</div>
                    <div className="text-[12px] text-muted-foreground">{r ? fmtDia(r) : ""}</div>
                  </div>
                  <span
                    className={
                      "flex-none rounded-full px-2.5 py-1 text-[11.5px] font-bold " +
                      (dias < 0
                        ? "bg-danger-bg text-danger"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400")
                    }
                  >
                    {dias < 0 ? `venceu há ${-dias}d` : dias === 0 ? "vence hoje" : `em ${dias}d`}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* lista de clientes (#15) */}
      <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center gap-2 text-[16px] font-bold">
          <Handshake size={18} weight="fill" className="text-success" /> Base de clientes
        </div>
        {clientes.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <SmileySad size={30} className="text-faint" />
            <p className="text-sm text-muted-foreground">
              Nenhum cliente fechado ainda. Quando você fechar um negócio no funil, ele aparece aqui.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-faint">
                  <th className="pb-2 text-left font-semibold">Cliente</th>
                  <th className="pb-2 text-left font-semibold">Cobrança</th>
                  <th className="pb-2 text-right font-semibold">Valor</th>
                  <th className="pb-2 text-right font-semibold">Renovação</th>
                </tr>
              </thead>
              <tbody>
                {clientes.map((l) => {
                  const dias = daysUntilRenewal(l);
                  return (
                    <tr key={l.id} className="border-t border-border">
                      <td className="py-2 pr-3">
                        <Link href={`/ficha/${l.id}`} className="font-semibold text-ink-2 hover:text-brand">
                          {l.business_name ?? "Cliente"}
                        </Link>
                        {l.city && <span className="ml-1.5 text-[12px] text-faint">{l.city}</span>}
                      </td>
                      <td className="py-2 text-muted-foreground">{billingLabel(l)}</td>
                      <td className="py-2 text-right font-semibold tabular-nums">
                        {l.deal_value ? brl(l.deal_value) : "—"}
                      </td>
                      <td className="py-2 text-right tabular-nums">
                        {dias === null ? (
                          <span className="text-faint">recorrente</span>
                        ) : dias < 0 ? (
                          <span className="font-semibold text-danger">venceu</span>
                        ) : (
                          <span className={dias <= 30 ? "font-semibold text-amber-700 dark:text-amber-400" : ""}>
                            em {dias}d
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* reativar frios (#16) */}
      <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
          <ArrowClockwise size={18} weight="bold" className="text-brand" /> Reativar frios
        </div>
        <p className="mb-4 text-[12.5px] text-muted-foreground">
          Sem resposta, sem interesse ou perdidos há mais de 30 dias. Receita barata parada — vale um novo toque.
        </p>
        {frios.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada esfriado o suficiente pra reativar agora.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {frios.slice(0, 24).map((l) => (
              <Link
                key={l.id}
                href={`/ficha/${l.id}`}
                className="flex items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5 transition-colors hover:border-brand"
              >
                <div className="min-w-0">
                  <div className="truncate text-[13px] font-semibold">{l.business_name ?? "Lead"}</div>
                  <div className="text-[11.5px] text-faint">{l.category ?? "—"}</div>
                </div>
                <span className="flex-none rounded-full bg-accent px-2 py-0.5 text-[10.5px] font-bold text-ink-2">
                  há {daysCold(l)}d
                </span>
              </Link>
            ))}
            {frios.length > 24 && (
              <div className="flex items-center px-1 text-[12px] text-faint">+{frios.length - 24} mais</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
