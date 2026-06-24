"use client";
// Dropdown de ramos com suporte a multi-selecao.
// Ramos ja selecionados aparecem marcados; clicar num ramo adiciona ou remove da lista.
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Check } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// Remove acentos pra busca tolerante.
function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

interface MultiRamoDropdownProps {
  selected: string[];
  options: string[];
  onToggle: (ramo: string) => void;
  ariaLabel?: string;
}

type Rect = { top: number; left: number; width: number };

export function MultiRamoDropdown({ selected, options, onToggle, ariaLabel = "Ramo" }: MultiRamoDropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(0);
  const activeRef = useRef(0);

  const measure = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 6, left: r.left, width: r.width });
  }, []);

  const toggle = useCallback(() => {
    setQuery("");
    measure();
    setOpen((o) => !o);
  }, [measure]);

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

  useEffect(() => {
    if (open) {
      const t = setTimeout(() => searchRef.current?.focus(), 0);
      return () => clearTimeout(t);
    }
  }, [open]);

  const visible = useMemo(() => {
    if (!query.trim()) return options;
    const q = norm(query.trim());
    return options.filter((o) => norm(o).includes(q));
  }, [options, query]);

  const label =
    selected.length === 0
      ? undefined
      : selected.length === 1
        ? selected[0]
        : `${selected.length} ramos selecionados`;

  // Limpa toda a selecao
  const handleClearAll = useCallback(() => {
    selected.forEach((r) => onToggle(r));
    setOpen(false);
  }, [selected, onToggle]);

  // Lista navegavel: indice 0 = "Qualquer ramo", indices 1..N = opcoes visiveis.
  const navCount = visible.length + 1;

  // Mantem o ref do indice ativo em dia (lido no handler de Enter sem recriar deps).
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  // Ao abrir, destaca o topo; ao filtrar, volta ao topo.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setActiveIndex(0);
  }, [open]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setActiveIndex(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // Navegacao por teclado: setas, Home/End e Enter (Esc ja fecha no efeito acima).
  useEffect(() => {
    if (!open) return;
    const onNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(navCount - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(navCount - 1);
      } else if (e.key === "Enter") {
        e.preventDefault();
        const idx = activeRef.current;
        if (idx === 0) {
          handleClearAll();
        } else {
          const o = visible[idx - 1];
          if (o) onToggle(o);
        }
      }
    };
    document.addEventListener("keydown", onNav);
    return () => document.removeEventListener("keydown", onNav);
  }, [open, navCount, visible, onToggle, handleClearAll]);

  // Rola a opcao destacada pra dentro da area visivel.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${baseId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, baseId]);

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        onClick={toggle}
        className={cn(
          "flex w-full items-center justify-between gap-2.5 rounded-xl border bg-surface-2 py-3 pl-4 pr-3.5 text-[13.5px] text-ink outline-none transition-colors",
          open ? "border-brand" : "border-border-2 hover:border-brand/50",
        )}
      >
        <span className="truncate">
          {label ? (
            <span className="font-semibold">{label}</span>
          ) : (
            <span className="text-faint">Qualquer ramo</span>
          )}
        </span>
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          className={cn("flex-none text-faint transition-transform duration-150", open && "rotate-180")}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              aria-multiselectable="true"
              aria-activedescendant={activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                minWidth: rect.width,
              }}
              className="z-[200] flex max-h-[320px] min-w-[200px] flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-xl"
            >
              {/* Busca */}
              <div className="relative flex-none border-b border-border p-2">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-faint"
                >
                  <circle cx="11" cy="11" r="8" />
                  <path d="m21 21-4.35-4.35" />
                </svg>
                <input
                  ref={searchRef}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar ramo..."
                  className="w-full rounded-lg border border-border-2 bg-surface-2 py-2 pl-9 pr-3 text-[13px] text-ink outline-none focus:border-brand"
                />
              </div>

              {/* Lista */}
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {/* "Qualquer ramo" limpa a selecao */}
                <button
                  id={`${baseId}-opt-0`}
                  type="button"
                  role="option"
                  aria-selected={selected.length === 0}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={handleClearAll}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-[10px] py-2.5 pl-3.5 pr-3 text-left text-[13.5px] transition-colors",
                    selected.length === 0
                      ? "bg-brand-50 font-semibold text-brand"
                      : activeIndex === 0
                        ? "bg-accent text-ink-2"
                        : "text-ink-2 hover:bg-accent",
                  )}
                >
                  <span className="truncate italic">Qualquer ramo</span>
                  {selected.length === 0 && (
                    <Check size={14} weight="bold" className="flex-none text-brand" />
                  )}
                </button>

                {visible.length === 0 ? (
                  <div className="px-3.5 py-3 text-[13px] text-faint">Nenhum ramo encontrado</div>
                ) : (
                  visible.map((o, i) => {
                    const active = selected.includes(o);
                    const highlighted = activeIndex === i + 1;
                    return (
                      <button
                        key={o}
                        id={`${baseId}-opt-${i + 1}`}
                        type="button"
                        role="option"
                        aria-selected={active}
                        onMouseEnter={() => setActiveIndex(i + 1)}
                        onClick={() => onToggle(o)}
                        className={cn(
                          "flex w-full items-center justify-between gap-3 rounded-[10px] py-2.5 pl-3.5 pr-3 text-left text-[13.5px] transition-colors",
                          active
                            ? "bg-brand-50 font-semibold text-brand"
                            : highlighted
                              ? "bg-accent text-ink-2"
                              : "text-ink-2 hover:bg-accent",
                        )}
                      >
                        <span className="truncate">{o}</span>
                        {active && (
                          <Check size={14} weight="bold" className="flex-none text-brand" />
                        )}
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
