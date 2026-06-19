"use client";
import { funnel, pct } from "@/lib/funnel";
import type { Lead } from "@/lib/types";

export function FunnelChart({ leads }: { leads: Lead[] }) {
  const stages = funnel(leads);
  const max = Math.max(1, ...stages.map((s) => s.reached));

  return (
    <div className="rounded-lg border p-4">
      <div className="mb-3 flex items-baseline justify-between">
        <h2 className="font-semibold">Funil</h2>
        <span className="text-xs text-muted-foreground">instantaneo · por status atual</span>
      </div>
      <div className="space-y-1.5">
        {stages.map((s) => (
          <div key={s.status} className="flex items-center gap-3">
            <div className="w-20 shrink-0 text-right text-sm text-muted-foreground sm:w-24">
              {s.label}
            </div>
            <div className="h-7 flex-1 overflow-hidden rounded bg-muted">
              <div
                className="flex h-full items-center bg-primary/25"
                style={{ width: `${(s.reached / max) * 100}%`, minWidth: s.reached ? "1.5rem" : 0 }}
              >
                <span className="px-2 text-sm font-medium tabular-nums">{s.reached || ""}</span>
              </div>
            </div>
            <div className="w-12 shrink-0 text-right text-xs text-muted-foreground">
              {s.conversion != null ? pct(s.conversion) : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
