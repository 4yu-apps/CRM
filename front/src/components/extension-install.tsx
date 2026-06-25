"use client";
import { DownloadSimple } from "@phosphor-icons/react";
import { cn } from "@/lib/utils";

// Bloco de instalacao da extensao. Compartilhado entre o /config (full) e o
// popover do badge (compact). Fonte unica da copy + link do zip pra nao
// duplicar e nunca ficar fora de sincronia.

const STEPS: [string, string][] = [
  ["1", "Baixar e descompactar"],
  ["2", "Abrir chrome://extensions"],
  ["3", "Carregar a pasta"],
];

export function ExtensionInstall({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-[16px] border border-brand/20 bg-brand-50/70 p-4">
      <div className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
        Baixe o arquivo, descompacte a pasta e carregue no Chrome em modo desenvolvedor.
        Depois abra o Google Maps ou o WhatsApp Web. O painel aparece sozinho quando estiver no lugar certo.
      </div>

      <div className={cn("grid gap-3 text-[13px] text-ink-2", compact ? "grid-cols-1" : "sm:grid-cols-3")}>
        {STEPS.map(([n, text]) => (
          <div key={n} className="flex gap-2 rounded-[13px] border border-border bg-card p-3">
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
              {n}
            </span>
            <span className="font-semibold leading-snug">{text}</span>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <a
          href="/4yu-crm-extension.zip"
          download="4yu-crm-extension.zip"
          className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5"
          style={{ background: "var(--grad)" }}
        >
          <DownloadSimple size={18} weight="bold" />
          Baixar extensão
        </a>
        {!compact && (
          <div className="text-[12.5px] leading-relaxed text-muted-foreground">
            No modo real, abra as Opções da extensão e entre com sua conta para ela gravar no seu CRM.
          </div>
        )}
      </div>
    </div>
  );
}
