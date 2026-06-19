import { fmtDateTime, fmtRelative } from "@/lib/format";
import { STATUS_META } from "@/lib/state-machine";
import type { ActorType, StatusHistory } from "@/lib/types";

const ACTOR_LABELS: Record<ActorType, string> = {
  human: "voce",
  system: "esteira",
  extension: "extensao",
};

export function HistoryTimeline({ items }: { items: StatusHistory[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem historico.</p>;
  }
  return (
    <ol className="relative space-y-4 border-l pl-4">
      {items.map((h) => (
        <li key={h.id} className="relative">
          <span className="absolute -left-[21px] top-1 size-2.5 rounded-full bg-primary ring-4 ring-background" />
          <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
            <span className="font-medium">{STATUS_META[h.to_status].label}</span>
            {h.from_status && (
              <span className="text-xs text-muted-foreground">
                de {STATUS_META[h.from_status].label}
              </span>
            )}
            <span className="text-xs text-muted-foreground">· {ACTOR_LABELS[h.actor]}</span>
            <span className="text-xs text-muted-foreground" title={fmtDateTime(h.changed_at)}>
              · {fmtRelative(h.changed_at)}
            </span>
          </div>
          {h.note && <p className="mt-0.5 text-sm text-muted-foreground">{h.note}</p>}
        </li>
      ))}
    </ol>
  );
}
