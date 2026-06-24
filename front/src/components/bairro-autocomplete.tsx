"use client";
// Autocomplete de bairro/zona, escopado na cidade ja escolhida. Mesma pegada do
// autocomplete de cidade, mas aceita texto livre tambem (zonas tipo "Zona 7" que
// nem sempre estao no mapa). Conforme digita, sugere bairros reais da cidade via
// Nominatim; clicar preenche, mas o usuario pode digitar o que quiser.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { MapPin, X } from "@phosphor-icons/react";
import { suggestBairros, type BairroSuggestion } from "@/lib/geocode";
import { cn } from "@/lib/utils";

interface BairroAutocompleteProps {
  value: string;
  onChange: (value: string) => void;
  // Chamado quando o usuario escolhe uma sugestao (traz as coordenadas reais
  // do bairro). Texto livre cai so no onChange.
  onPick?: (s: BairroSuggestion) => void;
  city: string;
  uf: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  ariaLabel?: string;
}

type Rect = { top: number; left: number; width: number };

export function BairroAutocomplete({
  value,
  onChange,
  onPick,
  city,
  uf,
  placeholder = "Comece a digitar o bairro ou zona",
  disabled = false,
  className,
  ariaLabel,
}: BairroAutocompleteProps) {
  const [suggestions, setSuggestions] = useState<BairroSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // So aplica o resultado se ainda for a requisicao mais recente (anti-corrida).
  const reqSeqRef = useRef(0);
  const baseId = useId();
  const [activeIndex, setActiveIndex] = useState(-1);
  const activeRef = useRef(-1);

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
      onChange(val); // texto livre sempre vale
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (!city || val.trim().length < 2) {
        setSuggestions([]);
        setOpen(false);
        return;
      }
      measure();
      setLoading(true);
      const seq = ++reqSeqRef.current;
      debounceRef.current = setTimeout(async () => {
        const results = await suggestBairros(val, city, uf);
        if (seq !== reqSeqRef.current) return;
        setSuggestions(results);
        setLoading(false);
        setOpen(true);
      }, 450);
    },
    [onChange, city, uf, measure],
  );

  const handlePick = useCallback(
    (s: BairroSuggestion) => {
      if (onPick) onPick(s);
      else onChange(s.name);
      closeMenu();
    },
    [onPick, onChange, closeMenu],
  );

  const handleClear = useCallback(() => {
    onChange("");
    setSuggestions([]);
    setOpen(false);
  }, [onChange]);

  // Mantem o ref do indice ativo em dia (lido no handler de Enter sem recriar deps).
  useEffect(() => {
    activeRef.current = activeIndex;
  }, [activeIndex]);

  // Ao abrir/atualizar sugestoes, destaca a primeira opcao.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (open) setActiveIndex(suggestions.length > 0 ? 0 : -1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, suggestions]);

  // Navegacao por teclado: setas, Home/End e Enter (Esc ja fecha no efeito acima).
  useEffect(() => {
    if (!open) return;
    const onNav = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => Math.min(suggestions.length - 1, i + 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => Math.max(0, i - 1));
      } else if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(suggestions.length - 1);
      } else if (e.key === "Enter") {
        const s = suggestions[activeRef.current];
        if (s) {
          e.preventDefault();
          handlePick(s);
        }
      }
    };
    document.addEventListener("keydown", onNav);
    return () => document.removeEventListener("keydown", onNav);
  }, [open, suggestions, handlePick]);

  // Rola a opcao destacada pra dentro da area visivel.
  useEffect(() => {
    if (!open) return;
    document.getElementById(`${baseId}-opt-${activeIndex}`)?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, baseId]);

  return (
    <div className={cn("relative", className)}>
      <div className="relative">
        <MapPin
          size={15}
          className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-faint"
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
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
          role="combobox"
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-controls={`${baseId}-listbox`}
          aria-activedescendant={open && activeIndex >= 0 ? `${baseId}-opt-${activeIndex}` : undefined}
          className={cn(
            "w-full rounded-xl border bg-surface-2 py-3.5 pl-9 pr-11 text-[14.5px] text-ink outline-none transition-colors disabled:cursor-not-allowed disabled:opacity-60",
            open ? "border-brand" : "border-border-2 hover:border-brand/50",
          )}
        />
        {(loading || value) && (
          <button
            type="button"
            onClick={loading ? undefined : handleClear}
            className="absolute right-1 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded text-faint hover:text-ink"
            aria-label="Limpar bairro"
          >
            {loading ? (
              <svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
              id={`${baseId}-listbox`}
              role="listbox"
              style={{ position: "fixed", top: rect.top, left: rect.left, minWidth: rect.width }}
              className="z-[200] flex max-h-[280px] min-w-[220px] flex-col overflow-hidden rounded-[14px] border border-border bg-card shadow-xl"
            >
              <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
                {suggestions.length === 0 && !loading ? (
                  <div className="px-3.5 py-2.5 text-[13px] text-faint">
                    Nenhum bairro encontrado. Pode digitar a zona do seu jeito.
                  </div>
                ) : (
                  suggestions.map((s, i) => {
                    const isSelected = s.name === value;
                    const highlighted = i === activeIndex;
                    return (
                    <button
                      key={s.name}
                      id={`${baseId}-opt-${i}`}
                      type="button"
                      role="option"
                      aria-selected={isSelected}
                      onMouseEnter={() => setActiveIndex(i)}
                      onClick={() => handlePick(s)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-[10px] py-2.5 pl-3.5 pr-3 text-left text-[13.5px] transition-colors",
                        isSelected
                          ? "bg-brand-50 font-semibold text-brand"
                          : highlighted
                            ? "bg-accent text-ink-2"
                            : "text-ink-2 hover:bg-accent",
                      )}
                    >
                      <MapPin size={14} className="flex-none text-faint" />
                      <span className="flex-1 truncate font-medium text-ink">{s.name}</span>
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
