"use client";
import { useMemo } from "react";
import {
  ChartLineUp,
  PaperPlaneTilt,
  ChatCircleDots,
  Handshake,
  TrendUp,
  TrendDown,
  Equals,
  SmileySad,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { funnel, depth } from "@/lib/funnel";
import type { Lead, LeadStatus } from "@/lib/types";

// ---------- helpers de periodo ----------

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=dom
  d.setDate(d.getDate() - day);
  d.setHours(0, 0, 0, 0);
  return d;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Leads criados em [from, to) */
function createdIn(leads: Lead[], from: Date, to: Date): Lead[] {
  return leads.filter((l) => {
    const t = new Date(l.created_at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
}

/** Leads que entraram em status >= alvo em [from, to) usando updated_at como proxy */
function updatedIn(leads: Lead[], from: Date, to: Date): Lead[] {
  return leads.filter((l) => {
    const t = new Date(l.updated_at).getTime();
    return t >= from.getTime() && t < to.getTime();
  });
}

// ---------- calculo de KPIs com delta ----------

interface KpiData {
  ic: React.ReactNode;
  label: string;
  value: number | string;
  deltaNum: number | null;
  deltaLabel: string;
}

function fmtDelta(n: number | null): string {
  if (n === null) return "";
  if (n === 0) return "igual a semana passada";
  return `${n > 0 ? "+" : ""}${n} vs semana passada`;
}

function buildKpis(leads: Lead[]): KpiData[] {
  const now = new Date();

  // semana atual: de startOfWeek(now) ate agora
  const weekStart = startOfWeek(now);
  const prevWeekStart = new Date(weekStart);
  prevWeekStart.setDate(prevWeekStart.getDate() - 7);

  const thisWeekLeads = createdIn(leads, weekStart, new Date(now.getTime() + 1));
  const prevWeekLeads = createdIn(leads, prevWeekStart, weekStart);

  // "Novos esta semana" = criados na semana
  const novosThis = thisWeekLeads.length;
  const novosPrev = prevWeekLeads.length;

  // "Prontos pra revisar" = rascunho_pronto no total (snapshot)
  const prontos = leads.filter((l) => l.status === "rascunho_pronto").length;
  // delta: prontos criados esta semana vs anterior (usa updated_at como proxy de chegada ao status)
  const prontosThis = updatedIn(
    leads.filter((l) => l.status === "rascunho_pronto"),
    weekStart,
    new Date(now.getTime() + 1)
  ).length;
  const prontosPrev = updatedIn(
    leads.filter((l) => l.status === "rascunho_pronto"),
    prevWeekStart,
    weekStart
  ).length;

  // "Em conversa" = respondeu + interessado + reuniao + proposta
  const conversa: LeadStatus[] = ["respondeu", "interessado", "reuniao", "proposta"];
  const emConversa = leads.filter((l) => conversa.includes(l.status)).length;
  const conversaThis = updatedIn(
    leads.filter((l) => conversa.includes(l.status)),
    weekStart,
    new Date(now.getTime() + 1)
  ).length;
  const conversaPrev = updatedIn(
    leads.filter((l) => conversa.includes(l.status)),
    prevWeekStart,
    weekStart
  ).length;

  // "Fechados" = status fechado; receita = soma deal_value
  const fechados = leads.filter((l) => l.status === "fechado");
  const fechadosThis = updatedIn(fechados, weekStart, new Date(now.getTime() + 1)).length;
  const fechadosPrev = updatedIn(fechados, prevWeekStart, weekStart).length;
  const receita = fechados.reduce((s, l) => s + (l.deal_value ?? 0), 0);

  const receitaFmt =
    receita > 0
      ? receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
      : `${fechados.length}`;

  return [
    {
      ic: <ChartLineUp size={17} className="text-brand" />,
      label: "Novos esta semana",
      value: novosThis,
      deltaNum: novosThis - novosPrev,
      deltaLabel: fmtDelta(novosThis - novosPrev),
    },
    {
      ic: <PaperPlaneTilt size={17} className="text-brand" />,
      label: "Prontos pra revisar",
      value: prontos,
      deltaNum: prontosThis - prontosPrev,
      deltaLabel: fmtDelta(prontosThis - prontosPrev),
    },
    {
      ic: <ChatCircleDots size={17} className="text-brand" />,
      label: "Em contato",
      value: emConversa,
      deltaNum: conversaThis - conversaPrev,
      deltaLabel: fmtDelta(conversaThis - conversaPrev),
    },
    {
      ic: <Handshake size={17} className="text-brand" />,
      label: receita > 0 ? "Receita fechada" : "Fechados",
      value: receita > 0 ? receitaFmt : fechados.length,
      deltaNum: fechadosThis - fechadosPrev,
      deltaLabel: fmtDelta(fechadosThis - fechadosPrev),
    },
  ];
}

// ---------- barras de funil ----------

interface FunnelBar {
  label: string;
  value: number;
  color: string;
  pct: number;
}

const BAR_COLORS = [
  "#C4B5FD",
  "#A78BFA",
  "#8B5CF6",
  "#7C3AED",
  "#6D28D9",
  "#15A05A",
];

function buildFunnelBars(leads: Lead[]): FunnelBar[] {
  const stages = funnel(leads);

  // "Passaram no filtro" = qualificados em diante (depth >= depth("qualificado"))
  const dQual = depth("qualificado");
  const passaram = leads.filter((l) => depth(l.status) >= dQual && depth(l.status) >= 0).length;

  const total = stages[0]?.reached ?? 0;

  const rows: { label: string; value: number }[] = [
    { label: "Encontrados", value: total },
    { label: "Passaram no filtro", value: passaram },
    { label: "Enviados", value: stages.find((s) => s.status === "enviado")?.reached ?? 0 },
    { label: "Responderam", value: stages.find((s) => s.status === "respondeu")?.reached ?? 0 },
    { label: "Reuniões", value: stages.find((s) => s.status === "reuniao")?.reached ?? 0 },
    { label: "Fecharam", value: stages.find((s) => s.status === "fechado")?.reached ?? 0 },
  ];

  return rows.map((r, i) => ({
    ...r,
    color: BAR_COLORS[i] ?? "#C4B5FD",
    pct: total > 0 ? Math.round((r.value / total) * 100) : 0,
  }));
}

// ---------- meta do mes ----------

interface MetaDoMes {
  fechados: number;
  receita: number;
  receitaFmt: string;
  mes: string;
}

function buildMeta(leads: Lead[]): MetaDoMes {
  const now = new Date();
  const from = startOfMonth(now);
  const to = endOfMonth(now);
  const fechadosMes = leads.filter(
    (l) =>
      l.status === "fechado" &&
      new Date(l.updated_at).getTime() >= from.getTime() &&
      new Date(l.updated_at).getTime() <= to.getTime()
  );
  const receita = fechadosMes.reduce((s, l) => s + (l.deal_value ?? 0), 0);
  const mes = now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return {
    fechados: fechadosMes.length,
    receita,
    receitaFmt:
      receita > 0
        ? receita.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
        : "R$ 0",
    mes,
  };
}

// ---------- icone de delta ----------

function DeltaIcon({ n }: { n: number | null }) {
  if (n === null || n === 0) return <Equals size={13} className="text-faint" />;
  if (n > 0) return <TrendUp size={13} className="text-success" />;
  return <TrendDown size={13} className="text-danger" />;
}

// ---------- pagina ----------

export default function ResultadosPage() {
  const { leads, loading } = useLeads();

  const kpis = useMemo(() => buildKpis(leads), [leads]);
  const funnelBars = useMemo(() => buildFunnelBars(leads), [leads]);
  const meta = useMemo(() => buildMeta(leads), [leads]);

  const totalLeads = leads.length;
  const maxBar = funnelBars[0]?.value ?? 0;

  // estado vazio educado
  if (!loading && totalLeads === 0) {
    return (
      <div className="mx-auto max-w-[1080px]">
        <div className="fu mx-auto mt-16 max-w-[520px] rounded-[22px] border border-border bg-card p-14 text-center shadow-[var(--shadow)]">
          <div className="mx-auto mb-5 flex size-18 items-center justify-center rounded-[20px] bg-brand-50 text-brand">
            <SmileySad size={38} weight="duotone" />
          </div>
          <div className="font-heading text-2xl font-bold">Sem dados ainda</div>
          <p className="mt-2 text-muted-foreground">
            Quando voce tiver leads na base, os resultados aparecem aqui com numeros reais. Comece buscando ou adicionando os primeiros contatos.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1080px] space-y-5">

      {/* KPIs 4x grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="fu rounded-[18px] border border-border bg-card p-5 shadow-[var(--shadow)]"
          >
            <div className="mb-3 flex items-center gap-2 text-[13px] text-muted-foreground">
              {k.ic}
              {k.label}
            </div>
            <div className="font-heading text-[32px] font-bold leading-none text-foreground">
              {loading ? (
                <span className="inline-block h-8 w-16 animate-pulse rounded bg-[var(--inset)]" />
              ) : (
                k.value
              )}
            </div>
            <div className="mt-1.5 flex items-center gap-1.5 text-[12.5px] font-semibold">
              <DeltaIcon n={k.deltaNum} />
              <span
                className={
                  k.deltaNum == null || k.deltaNum === 0
                    ? "text-faint"
                    : k.deltaNum > 0
                    ? "text-success"
                    : "text-danger"
                }
              >
                {k.deltaLabel}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* funil + meta */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1.5fr_1fr] lg:items-start">

        {/* barras do funil */}
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          <div className="mb-5 text-[16px] font-bold">Da prospecção ao fechamento</div>
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-4">
                  <div className="w-24 rounded bg-[var(--inset)] py-2 animate-pulse" />
                  <div className="h-[30px] flex-1 rounded-lg bg-[var(--inset)] animate-pulse" />
                </div>
              ))}
            </div>
          ) : maxBar === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead no funil ainda.</p>
          ) : (
            <div className="flex flex-col gap-3.5">
              {funnelBars.map((b) => (
                <div key={b.label} className="flex items-center gap-4">
                  <div className="w-[104px] flex-none text-right text-[13.5px] font-semibold text-ink-2">
                    {b.label}
                  </div>
                  <div className="relative flex-1 overflow-hidden rounded-[8px] bg-[var(--inset)]" style={{ height: 30 }}>
                    <div
                      className="absolute inset-y-0 left-0 flex items-center justify-end pr-2.5 transition-all duration-700"
                      style={{ width: b.pct + "%", backgroundColor: b.color }}
                    >
                      {b.value > 0 && (
                        <span className="text-[12.5px] font-bold text-white">{b.value}</span>
                      )}
                    </div>
                    {b.value === 0 && (
                      <span className="absolute inset-y-0 left-2 flex items-center text-[12.5px] text-faint">0</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* meta do mes */}
        <div
          className="fu relative overflow-hidden rounded-[18px] p-6 shadow-[var(--shadow-md)]"
          style={{ background: "var(--grad)", color: "#fff" }}
        >
          {/* detalhe geometrico */}
          <div
            className="absolute -bottom-7 -right-7 size-40 rounded-full border"
            style={{ borderColor: "rgba(255,255,255,.18)" }}
          />
          <div className="relative">
            <div className="text-[13px] font-semibold tracking-[.04em] opacity-85 uppercase">
              Meta do mes
            </div>
            <div className="mt-3 mb-1 flex items-baseline gap-2">
              <span className="font-heading text-[50px] font-bold leading-none">
                {loading ? (
                  <span className="inline-block h-12 w-10 animate-pulse rounded bg-white/20" />
                ) : (
                  meta.fechados
                )}
              </span>
              <span className="text-[18px] opacity-85">clientes fechados</span>
            </div>
            {meta.receita > 0 && (
              <div className="mt-1 text-[15px] font-semibold opacity-90">
                {meta.receitaFmt} em receita
              </div>
            )}
            <div className="mt-4 text-[13.5px] opacity-90">
              {meta.mes}
            </div>
            {!loading && meta.fechados === 0 && (
              <div className="mt-3 rounded-[12px] bg-white/15 px-4 py-3 text-[13px] leading-relaxed opacity-90">
                Nenhum lead fechado no mes ainda. Quando fechar o primeiro, aparece aqui.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
