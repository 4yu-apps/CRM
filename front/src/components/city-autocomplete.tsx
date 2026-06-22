"use client";
// Autocomplete de cidade nacional (tipo Uber): o usuario digita o nome da cidade
// e o sistema sugere "Cidade - UF" buscando em todos os municipios do Brasil via IBGE.
// Ao selecionar, preenche cidade E estado de uma vez.
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MagnifyingGlass, X } from "@phosphor-icons/react";
import { searchMunicipios, type MunicipioComUF } from "@/lib/ibge";
import { cn } from "@/lib/utils";

export interface CitySelection {
  cidade: string;
  uf: string;
}

interface CityAutocompleteProps {
  cidade: string;
  uf: string;
  onSelect: (sel: CitySelection) => void;
  onClear?: () => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

type Rect = { top: number; left: number; width: number };

export function CityAutocomplete({
  cidade,
  uf,
  onSelect,
  onClear,
  placeholder = "Digite a cidade...",
  className,
  disabled = false,
}: CityAutocompleteProps) {
  // Texto exibido no input: se ha cidade+uf selecionados, mostra "Cidade - UF"
  const displayValue = cidade ? (uf ? `${cidade} - ${uf}` : cidade) : "";

  const [query, setQuery] = useState(displayValue);
  const [suggestions, setSuggestions] = useState<MunicipioComUF[]>([]);
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [loading, setLoading] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Sincroniza o input quando cidade/uf mudam externamente (ex: "Surpreenda-me")
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setQuery(cidade ? (uf ? `${cidade} - ${uf}` : cidade) : "");
  }, [cidade, uf]);

  const measure = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setRect({ top: r.bottom + 4, left: r.left, width: r.width });
  }, []);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setSuggestions([]);
  }, []);

  // Fecha ao clicar fora
  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const t = e.target as Node;
      if (inputRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      closeMenu();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeMenu();
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
  }, [open, closeMenu, measure]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const val = e.target.value;
      setQuery(val);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!val.trim() || val.trim().length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      measure();
      setLoading(true);
      debounceRef.current = setTimeout(async () => {
        const results = await searchMunicipios(val);
        setSuggestions(results);
        setLoading(false);
        setOpen(results.length > 0);
      }, 250);
    },
    [measure],
  );

  const handleSelect = useCallback(
    (m: MunicipioComUF) => {
      onSelect({ cidade: m.nome, uf: m.uf });
      setQuery(`${m.nome} - ${m.uf}`);
      closeMenu();
    },
    [onSelect, closeMenu],
  );

  const handleClear = useCallback(() => {
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    onClear?.();
  }, [onClear]);

  const hasSelecionado = !!cidade;

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <MagnifyingGlass
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={handleChange}
          onFocus={() => {
            if (suggestions.length > 0) {
              measure();
              setOpen(true);
            }
          }}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete="off"
          className={cn(
            "w-full rounded-xl border bg-surface-2 py-3 pl-9 pr-9 text-[13.5px] text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            open ? "border-brand" : "border-border-2 hover:border-brand/50",
          )}
        />
        {(loading || hasSelecionado || query) && (
          <button
            type="button"
            onClick={loading ? undefined : handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-0.5 text-faint hover:text-ink"
            aria-label="Limpar cidade"
          >
            {loading ? (
              <svg
                className="animate-spin"
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <circle cx="12" cy="12" r="10" strokeOpacity="0.2" />
                <path d="M12 2a10 10 0 0 1 10 10" />
              </svg>
            ) : (
              <X size={14} weight="bold" />
            )}
          </button>
        )}
      </div>

      {open && rect && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="listbox"
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                minWidth: rect.width,
              }}
              className="z-[200] flex max-h-[280px] min-w-[220px] flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-xl"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {suggestions.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="option"
                    aria-selected={m.nome === cidade && m.uf === uf}
                    onClick={() => handleSelect(m)}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-[10px] py-2.5 pl-3.5 pr-3 text-left text-[13.5px] transition-colors",
                      m.nome === cidade && m.uf === uf
                        ? "bg-brand-50 font-semibold text-brand"
                        : "text-ink-2 hover:bg-accent",
                    )}
                  >
                    <span className="flex-1 truncate font-medium text-ink">{m.nome}</span>
                    <span className="flex-none rounded bg-[var(--inset)] px-1.5 py-0.5 text-[11px] font-bold text-faint">
                      {m.uf}
                    </span>
                  </button>
                ))}
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
