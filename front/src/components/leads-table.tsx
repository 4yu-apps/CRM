"use client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Star, ShieldOff } from "lucide-react";
import { StatusBadge } from "./status-badge";
import { fmtPhone, fmtRelative } from "@/lib/format";
import type { Lead } from "@/lib/types";

export function LeadsTable({
  leads,
  onSelect,
}: {
  leads: Lead[];
  onSelect: (id: string) => void;
}) {
  if (leads.length === 0) {
    return (
      <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
        Nenhum lead com esse filtro.
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40">
            <TableHead>Negocio</TableHead>
            <TableHead className="hidden md:table-cell">Local</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="hidden sm:table-cell text-right">Score</TableHead>
            <TableHead className="hidden lg:table-cell">Avaliacao</TableHead>
            <TableHead className="hidden lg:table-cell">Telefone</TableHead>
            <TableHead className="text-right">Atualizado</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {leads.map((l) => (
            <TableRow
              key={l.id}
              onClick={() => onSelect(l.id)}
              className="cursor-pointer"
            >
              <TableCell>
                <div className="flex items-center gap-2 font-medium">
                  {l.business_name ?? "Sem nome"}
                  {l.opt_out && (
                    <ShieldOff className="size-3.5 text-rose-500" aria-label="opt-out LGPD" />
                  )}
                </div>
                {l.category && (
                  <div className="text-xs text-muted-foreground">{l.category}</div>
                )}
              </TableCell>
              <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                {l.city ? `${l.city}/${l.state}` : "-"}
                {l.neighborhood && <div className="text-xs">{l.neighborhood}</div>}
              </TableCell>
              <TableCell>
                <StatusBadge status={l.status} />
              </TableCell>
              <TableCell className="hidden sm:table-cell text-right tabular-nums">
                {l.score ?? "-"}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {l.rating != null ? (
                  <span className="inline-flex items-center gap-1 text-sm">
                    <Star className="size-3.5 fill-amber-400 text-amber-400" />
                    {l.rating}
                    <span className="text-muted-foreground">({l.reviews_count ?? 0})</span>
                  </span>
                ) : (
                  "-"
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm tabular-nums">
                {fmtPhone(l.phone)}
              </TableCell>
              <TableCell className="text-right text-xs text-muted-foreground">
                {fmtRelative(l.updated_at)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
