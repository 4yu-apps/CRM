"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { CaretDown, Check, MagnifyingGlass } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

export type DropdownOption = {
  value: string;
  label: string;
  // Sufixo discreto a direita do label (ex: contagem "(762)").
  hint?: string;
};

type DropdownProps = {
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  // Texto quando nada casa com o value (placeholder).
  placeholder?: string;
  // Largura do gatilho. Default: ocupa o container (min-w garante respiro).
  className?: string;
  // Alinhamento do menu em relacao ao gatilho.
  align?: "start" | "end";
  ariaLabel?: string;
  // Mostra um campo de busca no topo do menu. Auto-liga com listas longas (>10).
  searchable?: boolean;
  disabled?: boolean;
};

// Remove acento pra busca tolerante ("sao" casa "São").
function norm(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type Rect = { top: number; left: number; width: number };

// Dropdown visual proprio (substitui o <select> nativo). Gatilho com padding
// folgado dos dois lados — o caret nunca encosta na borda. O menu vai num
// portal (position: fixed) pra nunca ser cortado por containers com
// overflow-hidden (Sections, cards). Fecha no clique-fora e no Esc; listas
// longas ganham busca automatica.
export function Dropdown({
  value,
  onChange,
  options,
  placeholder = "Selecionar",
  className,
  align = "start",
  ariaLabel,
  searchable,
  disabled = false,
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const selected = options.find((o) => o.value === value);
  const withSearch = searchable ?? options.length > 10;

  const visible = useMemo(() => {
    if (!withSearch || !query.trim()) return options;
    const q = norm(query.trim());
    return options.filter((o) => norm(o.label).includes(q));
  }, [options, query, withSearch]);

  // Mede o gatilho pra posicionar o menu (coordenadas de viewport, p/ fixed).
  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: align === "end" ? r.right : r.left, width: r.width });
  }, [align]);

  // Abre/fecha: mede o gatilho (inofensivo ao fechar) e zera a busca.
  const toggle = useCallback(() => {
    setQuery("");
    measure();
    setOpen((o) => !o);
  }, [measure]);

  // Fecha no clique-fora (considerando o menu no portal) e no Esc.
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    // Reposiciona enquanto aberto (scroll de qualquer ancestral / resize).
    const onReflow = () => measure();
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onReflow, true);
    window.addEventListener("resize", onReflow);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onReflow, true);
      window.removeEventListener("resize", onReflow);
    };
  }, [open, measure]);

  // Foca a busca ao abrir.
  useEffect(() => {
    if (open && withSearch) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open, withSearch]);

  return (
    <div className={cn("relative", className)}>
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        disabled={disabled}
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-between gap-2.5 rounded-xl border bg-surface-2 py-3 pl-4 pr-3.5 text-[13.5px] text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          open ? "border-brand" : "border-border-2 hover:border-brand/50",
        )}
      >
        <span className="truncate">
          {selected ? (
            <>
              {selected.label}
              {selected.hint ? <span className="ml-1 text-faint">{selected.hint}</span> : null}
            </>
          ) : (
            <span className="text-faint">{placeholder}</span>
          )}
        </span>
        <CaretDown
          size={14}
          weight="bold"
          className={cn("flex-none text-faint transition-transform duration-150", open && "rotate-180")}
        />
      </button>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                position: "fixed",
                top: rect.top,
                left: align === "end" ? undefined : rect.left,
                right: align === "end" ? Math.max(0, window.innerWidth - rect.left) : undefined,
                minWidth: rect.width,
              }}
              className="z-[60] flex max-h-[320px] min-w-[180px] flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-xl"
            >
              {withSearch && (
                <div className="relative flex-none border-b border-border p-2">
                  <MagnifyingGlass size={14} className="absolute left-4 top-1/2 -translate-y-1/2 text-faint" />
                  <input
                    ref={searchRef}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Buscar..."
                    className="w-full rounded-lg border border-border-2 bg-surface-2 py-2 pl-9 pr-3 text-[13px] text-ink outline-none focus:border-brand"
                  />
                </div>
              )}
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {visible.length === 0 ? (
                  <div className="px-3.5 py-3 text-[13px] text-faint">Nada encontrado</div>
                ) : (
                  visible.map((o) => {
                    const active = o.value === value;
                    return (
                      <button
                        key={o.value}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onClick={() => {
                          onChange(o.value);
                          setOpen(false);
                        }}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[10px] py-2.5 pl-3.5 pr-3 text-left text-[13.5px] transition-colors",
                          active ? "bg-brand-50 font-semibold text-brand" : "text-ink-2 hover:bg-accent",
                        )}
                      >
                        <span className="truncate">
                          {o.label}
                          {o.hint ? <span className="ml-1 font-normal text-faint">{o.hint}</span> : null}
                        </span>
                        {active && <Check size={14} weight="bold" className="flex-none text-brand" />}
                      </button>
                    );
                  })
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
