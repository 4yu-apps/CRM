// Bloco de carregamento (shimmer). Da percepcao de velocidade no lugar do spinner.
import { cn } from "@/lib/utils";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-pulse rounded-md bg-border", className)} aria-hidden />;
}

// Linhas de tabela/lista em carregamento (ex.: Contatos).
export function ListSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--shadow)]">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 border-b border-border px-5 py-4 last:border-0">
          <Skeleton className="size-4 rounded" />
          <div className="min-w-0 flex-1 space-y-2">
            <Skeleton className="h-3.5 w-1/3" />
            <Skeleton className="h-3 w-1/5" />
          </div>
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="hidden h-3 w-24 sm:block" />
        </div>
      ))}
    </div>
  );
}
