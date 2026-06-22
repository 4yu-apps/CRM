"use client";
import { Check } from "@phosphor-icons/react";
import type { Profession } from "@/lib/professions";
import { cn } from "@/lib/utils";

// Card de profissao (vertical). Reaproveitado pelo onboarding de primeiro acesso
// e pela tela de Configuracao (edicao depois). Escolher um card chama onSelect
// com a profissao inteira, pra quem usa pre-selecionar nichos e servico-alvo.
export function ProfessionCard({ profession, selected, onSelect }: {
  profession: Profession;
  selected: boolean;
  onSelect: (p: Profession) => void;
}) {
  const Icon = profession.icon;
  return (
    <button
      type="button"
      onClick={() => onSelect(profession)}
      aria-pressed={selected}
      className={cn(
        "group relative flex h-full flex-col gap-2 rounded-[16px] border p-4 text-left transition-all",
        selected
          ? "border-brand bg-brand-50 shadow-[0_6px_16px_var(--ring)]"
          : "border-border-2 bg-surface-2 hover:-translate-y-0.5 hover:border-brand/40 hover:bg-brand-50/50",
      )}
    >
      {selected && (
        <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-brand text-white">
          <Check size={11} weight="bold" />
        </span>
      )}
      <div
        className={cn(
          "flex size-10 flex-none items-center justify-center rounded-[12px] transition-colors",
          selected ? "bg-brand text-white" : "bg-brand-50 text-brand",
        )}
      >
        <Icon size={20} weight="duotone" />
      </div>
      <div className={cn("text-[14px] font-bold leading-snug", selected ? "text-brand" : "text-ink")}>
        {profession.label}
      </div>
      <div className="text-[12.5px] leading-relaxed text-muted-foreground">
        {profession.descricao}
      </div>
    </button>
  );
}
