"use client";
import { useMemo, useState } from "react";
import { useLeads } from "@/hooks/use-leads";
import { StatsBar } from "@/components/stats-bar";
import { FunnelFilter, type StatusFilter } from "@/components/funnel-filter";
import { LeadsTable } from "@/components/leads-table";
import { LeadDetailSheet } from "@/components/lead-detail-sheet";
import { NewLeadDialog } from "@/components/new-lead-dialog";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { leads, loading, error, refresh, repo } = useLeads();
  const [status, setStatus] = useState<StatusFilter>("todos");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return leads.filter((l) => {
      if (status !== "todos" && l.status !== status) return false;
      if (!q) return true;
      const hay = [l.business_name, l.city, l.neighborhood, l.phone, l.category, l.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [leads, status, query]);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Leads</h1>
          <p className="text-sm text-muted-foreground">
            CRM de prospeccao com humano no loop. A IA acha e rascunha, voce aprova e envia.
          </p>
        </div>
        <NewLeadDialog
          repo={repo}
          onCreated={(id) => {
            void refresh();
            setSelected(id);
          }}
        />
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/30 dark:text-rose-300">
          {error}
        </div>
      )}

      {loading ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-24" />
            ))}
          </div>
          <Skeleton className="h-10 w-full max-w-sm" />
          <Skeleton className="h-72 w-full" />
        </div>
      ) : (
        <div className="space-y-5">
          <StatsBar leads={leads} />
          <FunnelFilter
            leads={leads}
            value={status}
            onChange={setStatus}
            query={query}
            onQuery={setQuery}
          />
          <div className="text-xs text-muted-foreground">
            {filtered.length} de {leads.length} leads
          </div>
          <LeadsTable leads={filtered} onSelect={setSelected} />
        </div>
      )}

      <LeadDetailSheet
        leadId={selected}
        repo={repo}
        onClose={() => setSelected(null)}
        onChanged={refresh}
      />
    </div>
  );
}
