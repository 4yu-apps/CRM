"use client";
import { EXIT_STATUSES } from "@/lib/state-machine";
import type { Lead, LeadStatus } from "@/lib/types";

const inSet = (l: Lead, ...s: LeadStatus[]) => s.includes(l.status);

export function StatsBar({ leads }: { leads: Lead[] }) {
  const ativos = leads.filter((l) => !EXIT_STATUSES.includes(l.status)).length;
  const aguardandoAprovacao = leads.filter((l) => inSet(l, "rascunho_pronto")).length;
  const emConversa = leads.filter((l) => inSet(l, "respondeu", "interessado", "reuniao", "proposta")).length;
  const fechados = leads.filter((l) => inSet(l, "fechado")).length;

  const cards = [
    { label: "Leads ativos", value: ativos, hint: "no funil" },
    { label: "Aguardando aprovacao", value: aguardandoAprovacao, hint: "rascunho pronto", accent: "text-violet-600 dark:text-violet-400" },
    { label: "Em contato", value: emConversa, hint: "respondeu+", accent: "text-emerald-600 dark:text-emerald-400" },
    { label: "Fechados", value: fechados, hint: "ganhos", accent: "text-emerald-600 dark:text-emerald-400" },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border p-4">
          <div className={`text-2xl font-semibold tabular-nums ${c.accent ?? ""}`}>{c.value}</div>
          <div className="text-sm font-medium">{c.label}</div>
          <div className="text-xs text-muted-foreground">{c.hint}</div>
        </div>
      ))}
    </div>
  );
}
