import type { ScoreReason } from "@/lib/types";
import { cn } from "@/lib/utils";

// Score de referencia: o corte de qualificacao e 50 (scoring.py). Mostramos
// numa escala de 0 a 100 com marca no corte, cor por faixa e o porque em PT.
const MAX = 100;
const CUTOFF = 50;

function band(score: number): { label: string; bar: string; text: string } {
  if (score >= 70) return { label: "Alvo forte", bar: "bg-emerald-500", text: "text-emerald-600 dark:text-emerald-400" };
  if (score >= CUTOFF) return { label: "Alvo medio", bar: "bg-amber-500", text: "text-amber-600 dark:text-amber-400" };
  return { label: "Fora do alvo", bar: "bg-rose-500", text: "text-rose-600 dark:text-rose-400" };
}

export function ScoreMeter({ score, reason }: { score: number; reason: ScoreReason }) {
  const pct = Math.max(0, Math.min(100, Math.round((score / MAX) * 100)));
  const b = band(score);
  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div className="flex items-baseline justify-between">
        <div className="flex items-baseline gap-1.5">
          <span className="text-3xl font-bold tabular-nums">{score}</span>
          <span className="text-sm text-muted-foreground">/ {MAX}</span>
        </div>
        <span className={cn("text-sm font-semibold", b.text)}>{b.label}</span>
      </div>

      <div
        className="relative h-2.5 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuenow={score}
        aria-valuemin={0}
        aria-valuemax={MAX}
        aria-label="Score do lead"
      >
        <div className={cn("h-full rounded-full transition-all", b.bar)} style={{ width: `${pct}%` }} />
        <div
          className="absolute inset-y-0 w-px bg-foreground/40"
          style={{ left: `${CUTOFF}%` }}
          aria-hidden
        />
      </div>

      <ul className="space-y-1.5">
        {reason.criteria.map((c, i) => (
          <li key={i} className="flex items-start justify-between gap-3">
            <span className="text-foreground/80">{c.note ?? c.label}</span>
            <span
              className={cn(
                "shrink-0 font-semibold tabular-nums",
                c.points > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground",
              )}
            >
              {c.points > 0 ? `+${c.points}` : c.points}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
