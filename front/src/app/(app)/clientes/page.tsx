"use client";
// Carteira: quem paga, quanto entra, e quem merece atencao antes de virar
// problema.
//
// A tela antiga era uma lista completa com um bloco de alerta em cima, e um
// terceiro bloco de "reativar frios". Dois problemas: uma lista de clientes sem
// alerta e enciclopedia, nao ferramenta; e reaquecer lead que nunca fechou e
// prospeccao, nao carteira, entao a tela respondia duas perguntas diferentes ao
// mesmo tempo. Frios voltaram pra Contatos, onde ha filtro pra isso.
//
// Agora a pergunta que abre a tela e "o que eu faco hoje?", e a resposta e a aba
// Atencao. Ativos e Encerrados ficam pra quando a pergunta for outra.
import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Handshake, SmileySad, Warning, ArrowBendUpLeft, Clock, CurrencyCircleDollar,
  Cake, CalendarX, ArrowCounterClockwise,
} from "@phosphor-icons/react";
import { toast } from "sonner";
import { useLeads } from "@/hooks/use-leads";
import {
  isClient, isChurned, attentionOf, renewalDate, mrr, churnedMrr,
  type Attention, type AttentionKind,
} from "@/lib/clients";
import { ChurnModal } from "@/components/churn-modal";
import { ListSkeleton } from "@/components/skeleton";
import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/types";

const brl = (v: number) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });

const fmtDia = (d: Date | string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

function billingLabel(l: Lead): string {
  if (l.deal_billing === "mensal_fixo") return "Mensal fixo";
  if (l.deal_billing === "por_prazo") return `Por prazo${l.deal_term_months ? ` (${l.deal_term_months}m)` : ""}`;
  return "—";
}

const ATTENTION_META: Record<AttentionKind, { Icon: typeof Warning; cls: string }> = {
  vencido: { Icon: CalendarX, cls: "bg-danger-bg text-danger" },
  renovacao: { Icon: Warning, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" },
  aniversario: { Icon: Cake, cls: "bg-brand-50 text-brand" },
  silencio: { Icon: Clock, cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400" },
  sem_valor: { Icon: CurrencyCircleDollar, cls: "bg-muted text-muted-foreground" },
};

function Chip({ a }: { a: Attention }) {
  const meta = ATTENTION_META[a.kind];
  return (
    <span className={cn("flex flex-none items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold", meta.cls)}>
      <meta.Icon size={12} weight="fill" /> {a.label}
    </span>
  );
}

type Aba = "atencao" | "ativos" | "encerrados";

export default function ClientesPage() {
  const { leads, loading, repo, refresh } = useLeads();
  // null = ainda nao escolheram aba na mao; a tela decide sozinha.
  const [abaEscolhida, setAbaEscolhida] = useState<Aba | null>(null);
  const [saindo, setSaindo] = useState<Lead | null>(null);
  const [voltando, setVoltando] = useState<string | null>(null);

  const ativos = useMemo(
    () =>
      leads
        .filter(isClient)
        .sort((a, b) => +new Date(b.deal_closed_at ?? b.updated_at) - +new Date(a.deal_closed_at ?? a.updated_at)),
    [leads],
  );

  const atencao = useMemo(
    () =>
      ativos
        .map((l) => ({ l, a: attentionOf(l) }))
        .filter((x): x is { l: Lead; a: Attention } => x.a !== null)
        .sort((x, y) => x.a.rank - y.a.rank),
    [ativos],
  );

  const encerrados = useMemo(
    () =>
      leads
        .filter(isChurned)
        .sort((a, b) => +new Date(b.churn_at ?? b.updated_at) - +new Date(a.churn_at ?? a.updated_at)),
    [leads],
  );

  // Abre onde ha o que fazer. Se nada pede atencao, a aba de alerta vazia seria
  // uma tela em branco escondendo a carteira: quem acabou de cadastrar um
  // cliente nao veria o proprio cliente. Sem nada pendente, mostra os ativos.
  const aba: Aba = abaEscolhida ?? (atencao.length > 0 ? "atencao" : "ativos");
  const setAba = setAbaEscolhida;

  const receitaMensal = useMemo(() => mrr(leads), [leads]);
  const perdido = useMemo(() => churnedMrr(leads), [leads]);

  const reativar = async (l: Lead) => {
    setVoltando(l.id);
    try {
      await repo.transition(l.id, "fechado", "human", "cliente voltou");
      await repo.update(l.id, { churn_at: null, churn_reason: null });
      toast.success(`${l.business_name ?? "Cliente"} voltou pra carteira.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reativar");
    } finally {
      setVoltando(null);
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <ListSkeleton rows={6} />
      </div>
    );
  }

  const ABAS: { id: Aba; label: string; n: number }[] = [
    { id: "atencao", label: "Atenção", n: atencao.length },
    { id: "ativos", label: "Ativos", n: ativos.length },
    { id: "encerrados", label: "Encerrados", n: encerrados.length },
  ];

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-2xl font-bold">Clientes</h1>
          <p className="text-[13.5px] text-muted-foreground">Sua carteira: quem paga, quanto entra e quem precisa de você.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center shadow-[var(--shadow)]">
            <div className="font-heading text-[22px] font-bold leading-none">{ativos.length}</div>
            <div className="mt-1 text-[11.5px] text-faint">clientes</div>
          </div>
          <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center shadow-[var(--shadow)]">
            <div className="font-heading text-[22px] font-bold leading-none text-success">{brl(receitaMensal)}</div>
            <div className="mt-1 text-[11.5px] text-faint">MRR ativo</div>
          </div>
          {perdido > 0 && (
            <div className="rounded-[14px] border border-border bg-card px-4 py-2.5 text-center shadow-[var(--shadow)]">
              <div className="font-heading text-[22px] font-bold leading-none text-danger">{brl(perdido)}</div>
              <div className="mt-1 text-[11.5px] text-faint">saiu da carteira</div>
            </div>
          )}
        </div>
      </div>

      {/* Abas. Atencao vem primeiro porque e a pergunta que abre a tela. */}
      <div className="flex flex-wrap gap-2">
        {ABAS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setAba(t.id)}
            aria-pressed={aba === t.id}
            className={cn(
              "flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[13.5px] font-semibold transition-colors",
              aba === t.id
                ? "border-brand bg-brand-50 text-brand"
                : "border-border-2 bg-surface-2 text-muted-foreground hover:text-ink",
            )}
          >
            {t.label}
            <span
              className={cn(
                "rounded-full px-1.5 py-0.5 text-[11px] font-bold",
                aba === t.id ? "bg-brand text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {t.n}
            </span>
          </button>
        ))}
      </div>

      {aba === "atencao" && (
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          {atencao.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <Handshake size={30} weight="fill" className="text-success" />
              <p className="text-sm text-muted-foreground">
                {ativos.length === 0
                  ? "Nenhum cliente ainda. Quando você fechar um negócio, ele aparece aqui."
                  : "Carteira em dia. Nenhum contrato vencendo, nenhuma conta no silêncio."}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              {atencao.map(({ l, a }) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <Link href={`/ficha/${l.id}`} className="text-[13.5px] font-semibold text-ink-2 hover:text-brand">
                      {l.business_name ?? "Cliente"}
                    </Link>
                    <div className="text-[12px] text-muted-foreground">
                      {billingLabel(l)}
                      {l.deal_value != null && <span className="ml-1.5">· {brl(l.deal_value)}</span>}
                    </div>
                  </div>
                  <Chip a={a} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {aba === "ativos" && (
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          {ativos.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center">
              <SmileySad size={30} className="text-faint" />
              <p className="text-sm text-muted-foreground">
                Nenhum cliente fechado ainda. Quando você fechar um negócio no funil, ele aparece aqui.
              </p>
            </div>
          ) : (
            <>
              {/* Tabela so no desktop. No celular ela estourava a largura e
                  cortava justamente a primeira coluna: dava pra ver valor e
                  cobranca de um cliente cujo nome estava fora da tela. */}
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-faint">
                      <th className="pb-2 text-left font-semibold">Cliente</th>
                      <th className="pb-2 text-left font-semibold">Cobrança</th>
                      <th className="pb-2 text-right font-semibold">Valor</th>
                      <th className="pb-2 text-right font-semibold">Próxima data</th>
                      <th className="pb-2 text-right font-semibold">Saída</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ativos.map((l) => {
                      const r = renewalDate(l);
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
                            {l.deal_value != null ? brl(l.deal_value) : "—"}
                          </td>
                          <td className="py-2 text-right tabular-nums text-muted-foreground">
                            {r ? fmtDia(r) : "—"}
                          </td>
                          <td className="py-2 text-right">
                            <button
                              type="button"
                              onClick={() => setSaindo(l)}
                              aria-label={`Registrar saída de ${l.business_name ?? "cliente"}`}
                              className="text-[12px] font-semibold text-faint hover:text-danger"
                            >
                              Registrar saída
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Celular: um cartao por cliente, sem coluna pra cortar. */}
              <div className="flex flex-col gap-2 lg:hidden">
                {ativos.map((l) => {
                  const r = renewalDate(l);
                  return (
                    <div key={l.id} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
                      <div className="flex items-start justify-between gap-2">
                        <Link href={`/ficha/${l.id}`} className="text-[14px] font-semibold text-ink-2 hover:text-brand">
                          {l.business_name ?? "Cliente"}
                        </Link>
                        {l.deal_value != null && (
                          <span className="flex-none text-[14px] font-bold tabular-nums text-ink">{brl(l.deal_value)}</span>
                        )}
                      </div>
                      <div className="mt-0.5 text-[12px] text-muted-foreground">
                        {billingLabel(l)}
                        {r && <span className="ml-1.5 text-faint">· próxima em {fmtDia(r)}</span>}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSaindo(l)}
                        aria-label={`Registrar saída de ${l.business_name ?? "cliente"}`}
                        className="mt-2 text-[12px] font-semibold text-faint hover:text-danger"
                      >
                        Registrar saída
                      </button>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {aba === "encerrados" && (
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          <div className="mb-1 flex items-center gap-2 text-[16px] font-bold">
            <ArrowBendUpLeft size={18} weight="bold" className="text-danger" /> Quem saiu
          </div>
          <p className="mb-4 text-[12.5px] text-muted-foreground">
            Não some da tela de propósito: o motivo da saída é a parte que ensina alguma coisa.
          </p>
          {encerrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ninguém saiu ainda.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {encerrados.map((l) => (
                <div
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[12px] border border-border bg-surface-2 px-3.5 py-2.5 opacity-80"
                >
                  <div className="min-w-0">
                    <Link href={`/ficha/${l.id}`} className="text-[13.5px] font-semibold text-ink-2 hover:text-brand">
                      {l.business_name ?? "Cliente"}
                    </Link>
                    <div className="text-[12px] text-muted-foreground">
                      {l.churn_reason ?? "sem motivo registrado"}
                      {l.churn_at && <span className="ml-1.5 text-faint">· {fmtDia(l.churn_at)}</span>}
                      {l.deal_value != null && <span className="ml-1.5 text-faint">· era {brl(l.deal_value)}</span>}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => reativar(l)}
                    disabled={voltando === l.id}
                    className="flex flex-none items-center gap-1.5 rounded-full border border-border-2 px-3 py-1 text-[11.5px] font-semibold text-ink-2 hover:border-brand hover:text-brand disabled:opacity-50"
                  >
                    <ArrowCounterClockwise size={12} weight="bold" />
                    {voltando === l.id ? "Voltando..." : "Voltou"}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {saindo && (
        <ChurnModal lead={saindo} onClose={() => setSaindo(null)} onDone={refresh} />
      )}
    </div>
  );
}
