"use client";
import { Button } from "@/components/ui/button";
import { CONTACT_STATUSES, nextStatuses, STATUS_META, transitionLabel } from "@/lib/state-machine";
import type { Lead, LeadStatus } from "@/lib/types";

function variantFor(to: LeadStatus): "default" | "secondary" | "outline" {
  const stage = STATUS_META[to].stage;
  if (stage === "saida") return "outline";
  if (to === "aprovado" || to === "enviado" || to === "rascunho_pronto") return "default";
  return "secondary";
}

export function StatusActions({
  lead,
  onTransition,
  size = "sm",
}: {
  lead: Lead;
  onTransition: (to: LeadStatus, label: string) => void;
  size?: "sm" | "default";
}) {
  const nexts = nextStatuses(lead.status);
  if (nexts.length === 0) {
    return <p className="text-sm text-muted-foreground">Status final — sem proximos passos.</p>;
  }

  return (
    <div className="flex flex-wrap gap-2">
      {nexts.map((to) => {
        const blocked = lead.opt_out && CONTACT_STATUSES.includes(to);
        const label = transitionLabel(lead.status, to);
        return (
          <span key={to} title={blocked ? "Bloqueado: lead com opt-out (LGPD)." : undefined}>
            <Button
              size={size}
              variant={variantFor(to)}
              disabled={blocked}
              onClick={() => onTransition(to, label)}
            >
              {label}
            </Button>
          </span>
        );
      })}
    </div>
  );
}
