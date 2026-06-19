import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { STATUS_META, TONE_CLASSES } from "@/lib/state-machine";
import type { LeadStatus } from "@/lib/types";

export function StatusBadge({ status, className }: { status: LeadStatus; className?: string }) {
  const m = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn("font-medium", TONE_CLASSES[m.tone], className)}>
      {m.label}
    </Badge>
  );
}
