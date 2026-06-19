// Stub das páginas durante o rebuild (A1). Cada uma é construída na sua fase C.
export function Placeholder({ title, phase, note }: { title: string; phase: string; note?: string }) {
  return (
    <div className="mx-auto max-w-[1100px]">
      <div className="fu rounded-2xl border border-border bg-card p-10 shadow-[var(--shadow)]">
        <div className="text-xs font-bold uppercase tracking-wider text-faint">Em construção · fase {phase}</div>
        <h1 className="mt-2 font-heading text-2xl font-bold tracking-tight">{title}</h1>
        <p className="mt-2 max-w-xl text-muted-foreground">
          {note ?? "O shell e o design system já estão prontos. O conteúdo desta tela entra na fase indicada."}
        </p>
      </div>
    </div>
  );
}
