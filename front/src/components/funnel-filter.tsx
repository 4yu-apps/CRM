"use client";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { STATUS_META, STATUS_ORDER, TONE_CLASSES } from "@/lib/state-machine";
import type { Lead, LeadStatus } from "@/lib/types";

export type StatusFilter = LeadStatus | "todos";

function Chip({
  active,
  onClick,
  children,
  tone,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors",
        active ? "border-foreground bg-foreground text-background" : cn("hover:bg-muted", tone),
      )}
    >
      {children}
    </button>
  );
}

export function FunnelFilter({
  leads,
  value,
  onChange,
  query,
  onQuery,
}: {
  leads: Lead[];
  value: StatusFilter;
  onChange: (v: StatusFilter) => void;
  query: string;
  onQuery: (q: string) => void;
}) {
  const counts = new Map<LeadStatus, number>();
  for (const l of leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);
  const present = STATUS_ORDER.filter((s) => (counts.get(s) ?? 0) > 0);

  return (
    <div className="space-y-3">
      <Input
        placeholder="Buscar por nome, cidade, telefone…"
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        className="max-w-sm"
      />
      <div className="flex gap-2 overflow-x-auto pb-1">
        <Chip active={value === "todos"} onClick={() => onChange("todos")}>
          Todos <span className="opacity-70">{leads.length}</span>
        </Chip>
        {present.map((s) => (
          <Chip
            key={s}
            active={value === s}
            tone={TONE_CLASSES[STATUS_META[s].tone]}
            onClick={() => onChange(s)}
          >
            {STATUS_META[s].label} <span className="opacity-70">{counts.get(s)}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
