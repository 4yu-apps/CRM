"use client";
import { kpis, pct } from "@/lib/funnel";
import type { Lead } from "@/lib/types";

export function KpiCards({ leads }: { leads: Lead[] }) {
  const k = kpis(leads);
  const cards: { label: string; value: string | number; hint?: string; accent?: string }[] = [
    { label: "Leads", value: k.total, hint: "na base" },
    { label: "Qualificados", value: k.qualificados, hint: "passaram no ICP" },
    { label: "Enviados", value: k.enviados, hint: "abordados" },
    { label: "Taxa de resposta", value: pct(k.taxaResposta), hint: "respondeu / enviado", accent: "text-sky-600 dark:text-sky-400" },
    { label: "Reunioes", value: k.reunioes, accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Fechados", value: k.fechados, hint: pct(k.taxaFechamento) + " dos enviados", accent: "text-emerald-600 dark:text-emerald-400" },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border p-4">
          <div className={`text-2xl font-semibold tabular-nums ${c.accent ?? ""}`}>{c.value}</div>
          <div className="text-sm font-medium">{c.label}</div>
          {c.hint && <div className="text-xs text-muted-foreground">{c.hint}</div>}
        </div>
      ))}
    </div>
  );
}
