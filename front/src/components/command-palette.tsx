"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";
import { searchLeads } from "@/lib/lead-search";
import { STATUS_META } from "@/lib/state-machine";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = {
  href: string;
  label: string;
  Icon: React.ComponentType<{ size: number; weight?: "fill" | "regular" }>;
};

type Item =
  | { kind: "nav"; href: string; label: string; Icon: NavItem["Icon"] }
  | { kind: "lead"; lead: Lead };

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  navItems: NavItem[];
  leads: Lead[];
}

// O conteudo eh montado so quando open=true (key=open reseta o estado interno
// ao reabrir sem precisar de setState dentro de useEffect).
function PaletteInner({ onClose, navItems, leads }: Omit<CommandPaletteProps, "open">) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [rawCursor, setRawCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Foco no input ao montar (sem setState dentro do effect).
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const navMatches: Item[] =
    q.trim().length === 0
      ? navItems.map((n) => ({ kind: "nav" as const, ...n }))
      : navItems
          .filter((n) => n.label.toLowerCase().includes(q.trim().toLowerCase()))
          .map((n) => ({ kind: "nav" as const, ...n }));

  const leadMatches: Item[] = searchLeads(leads, q).map((l) => ({
    kind: "lead" as const,
    lead: l,
  }));

  const items: Item[] = [...navMatches, ...leadMatches];

  // Cursor clampado derivado (sem effect separado).
  const cursor = items.length === 0 ? 0 : Math.min(rawCursor, items.length - 1);

  const go = (item: Item) => {
    onClose();
    if (item.kind === "nav") {
      router.push(item.href);
    } else {
      router.push(`/ficha/${item.lead.id}`);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onClose();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setRawCursor((c) => Math.min(c + 1, items.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setRawCursor((c) => Math.max(c - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      const item = items[cursor];
      if (item) go(item);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 pt-[14vh] backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="mx-4 w-full max-w-[540px] overflow-hidden rounded-2xl border border-border bg-card shadow-2xl">
        {/* Input */}
        <div className="flex items-center gap-3 border-b border-border px-4 py-3">
          <MagnifyingGlass size={16} className="flex-none text-faint" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setRawCursor(0);
            }}
            onKeyDown={handleKeyDown}
            placeholder="Navegar ou buscar lead..."
            className="flex-1 bg-transparent text-[14px] text-ink outline-none placeholder:text-faint"
          />
          <kbd className="hidden rounded border border-border bg-accent px-1.5 py-0.5 text-[11px] text-faint sm:block">
            Esc
          </kbd>
        </div>

        {/* Lista */}
        <div className="max-h-[60vh] overflow-y-auto pb-2">
          {/* Secao: Navegar */}
          {navMatches.length > 0 && (
            <div>
              <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-faint">
                Navegar
              </div>
              {navMatches.map((item, i) => {
                const navItem = item as { kind: "nav"; href: string; label: string; Icon: NavItem["Icon"] };
                const active = cursor === i;
                return (
                  <button
                    key={navItem.href}
                    type="button"
                    onMouseEnter={() => setRawCursor(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <navItem.Icon size={16} weight={active ? "fill" : "regular"} />
                    <span className="text-[13.5px] font-medium text-ink">{navItem.label}</span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Secao: Ir para um lead */}
          {leadMatches.length > 0 && (
            <div>
              <div className="px-4 pb-1 pt-3 text-[11px] font-bold uppercase tracking-wider text-faint">
                Ir para um lead
              </div>
              {leadMatches.map((item, ri) => {
                const leadItem = item as { kind: "lead"; lead: Lead };
                const i = navMatches.length + ri;
                const active = cursor === i;
                return (
                  <button
                    key={leadItem.lead.id}
                    type="button"
                    onMouseEnter={() => setRawCursor(i)}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => go(item)}
                    className={cn(
                      "flex w-full flex-col items-start gap-0.5 px-4 py-2.5 text-left transition-colors",
                      active ? "bg-accent" : "hover:bg-accent/50",
                    )}
                  >
                    <span className="text-[13.5px] font-medium text-ink">
                      {leadItem.lead.business_name ?? "(sem nome)"}
                    </span>
                    <span className="text-[12px] text-faint">
                      {[leadItem.lead.city, leadItem.lead.state].filter(Boolean).join(" / ") ||
                        STATUS_META[leadItem.lead.status]?.label}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Estado vazio (so quando ha consulta ativa) */}
          {q.trim().length >= 2 && items.length === 0 && (
            <div className="px-4 py-6 text-center text-[13px] text-faint">
              Nada encontrado para &ldquo;{q}&rdquo;
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export function CommandPalette({ open, onClose, navItems, leads }: CommandPaletteProps) {
  if (!open) return null;
  // key={String(open)} garante remontagem (e reset de estado) a cada abertura.
  return (
    <PaletteInner
      key={String(open)}
      onClose={onClose}
      navItems={navItems}
      leads={leads}
    />
  );
}
