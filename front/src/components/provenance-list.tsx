import { Badge } from "@/components/ui/badge";
import { sourceLabel, fmtRelative } from "@/lib/format";
import type { FieldProvenance } from "@/lib/types";

const FIELD_LABELS: Record<string, string> = {
  business_name: "Nome",
  phone: "Telefone",
  cnpj: "CNPJ",
  email: "E-mail",
  instagram: "Instagram",
  website: "Site",
  owner_name: "Dono",
};

export function ProvenanceList({ items }: { items: FieldProvenance[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem proveniencia registrada ainda.</p>;
  }
  return (
    <ul className="divide-y rounded-md border text-sm">
      {items.map((p) => (
        <li key={p.id} className="space-y-1 px-3 py-2.5">
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <span className="font-medium">{FIELD_LABELS[p.field_name] ?? p.field_name}</span>
            <div className="flex shrink-0 items-center gap-2">
              {p.confidence != null && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(p.confidence * 100)}%
                </span>
              )}
              <Badge variant="secondary" className="font-normal">
                {sourceLabel(p.source)}
              </Badge>
              <span className="hidden text-xs text-muted-foreground sm:inline">
                {fmtRelative(p.found_at)}
              </span>
            </div>
          </div>
          <p className="break-words text-foreground" title={p.value ?? ""}>
            {p.value || <span className="text-muted-foreground">(ausente)</span>}
          </p>
        </li>
      ))}
    </ul>
  );
}
