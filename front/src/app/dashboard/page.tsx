"use client";
import { useLeads } from "@/hooks/use-leads";
import { kpis } from "@/lib/funnel";
import { KpiCards } from "@/components/kpi-cards";
import { FunnelChart } from "@/components/funnel-chart";
import { RevenueGoal } from "@/components/revenue-goal";
import { Skeleton } from "@/components/ui/skeleton";

export default function Dashboard() {
  const { leads, loading, error } = useLeads();

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-8 sm:px-6">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Funil, conversao e progresso pra meta de receita.</p>
      </div>

      {error && (
        <div className="rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <Skeleton className="h-28 w-full" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <>
          <KpiCards leads={leads} />
          <div className="grid gap-5 lg:grid-cols-2">
            <FunnelChart leads={leads} />
            <RevenueGoal fechados={kpis(leads).fechados} />
          </div>
        </>
      )}
    </div>
  );
}
