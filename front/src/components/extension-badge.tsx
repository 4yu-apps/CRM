"use client";
import { useEffect, useRef, useState } from "react";
import { PuzzlePiece, CheckCircle, X } from "@phosphor-icons/react";
import { useExtension } from "@/lib/use-extension";
import { ExtensionInstall } from "@/components/extension-install";
import { cn } from "@/lib/utils";

// Badge no topbar que detecta a extensao. Tres estados:
//  - verificando (null): nada (nao pisca enquanto checa);
//  - presente: check discreto com tooltip;
//  - ausente: aviso ambar que abre um popover com o instalador.
// Nao intrusivo: quando o usuario dispensa, para de chamar atencao mas
// continua acessivel.

const DISMISS_KEY = "garimpo:ext-badge-dismissed";

export function ExtensionBadge() {
  const { installed, recheck } = useExtension();
  const [open, setOpen] = useState(false);
  // Lazy initializer (nao setState no effect): no primeiro paint o badge so
  // aparece com installed !== null, entao nao ha mismatch de hidratacao.
  const [dismissed, setDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // localStorage indisponivel (modo privado): badge segue funcional
      return false;
    }
  });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  // Ainda verificando: nao renderiza nada (evita piscar).
  if (installed === null) return null;

  // Presente: check discreto (tooltip nativo via title).
  if (installed) {
    return (
      <span
        title="Extensão conectada"
        aria-label="Extensão conectada"
        className="hidden size-9 items-center justify-center rounded-full border border-emerald-200 bg-emerald-50 text-emerald-600 sm:inline-flex"
      >
        <CheckCircle size={18} weight="fill" />
      </span>
    );
  }

  // Ausente.
  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignora */
    }
    setDismissed(true);
    setOpen(false);
  };
  const onAlreadyInstalled = () => {
    recheck();
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Instalar extensão do CRM"
        title="Instalar extensão"
        className={cn(
          "relative flex size-9 items-center justify-center rounded-full border transition-colors",
          dismissed
            ? "border-border bg-accent text-muted-foreground hover:bg-accent/70"
            : "border-amber-300 bg-amber-50 text-amber-700 hover:bg-amber-100",
        )}
      >
        <PuzzlePiece size={18} weight="bold" />
        {!dismissed && (
          <span
            className="absolute -right-0.5 -top-0.5 size-2.5 rounded-full bg-amber-500"
            style={{ animation: "pulseDot 1.8s ease-in-out infinite" }}
          />
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 w-[320px] rounded-2xl border border-border bg-card p-4 shadow-xl">
          <div className="mb-3 flex items-start justify-between gap-2">
            <div>
              <div className="text-sm font-bold">Instale a extensão</div>
              <div className="mt-0.5 text-[12.5px] leading-snug text-muted-foreground">
                Ela acelera o WhatsApp Web e captura leads direto do Google Maps.
              </div>
            </div>
            <button
              type="button"
              aria-label="Fechar"
              onClick={() => setOpen(false)}
              className="flex-none rounded-lg p-1 text-muted-foreground hover:bg-accent"
            >
              <X size={15} weight="bold" />
            </button>
          </div>

          <ExtensionInstall compact />

          <div className="mt-3 flex items-center justify-between text-[12.5px]">
            <button type="button" onClick={onAlreadyInstalled} className="font-semibold text-brand-700 hover:underline">
              Já instalei
            </button>
            <button type="button" onClick={dismiss} className="text-muted-foreground hover:underline">
              Não mostrar de novo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
