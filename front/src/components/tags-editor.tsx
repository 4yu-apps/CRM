"use client";
// #20 — Editor de tags do lead. Etiquetas livres (minusculas) salvas em
// leads.tags. Usado na ficha; o filtro por tag mora em contatos.
import { useState } from "react";
import { toast } from "sonner";
import { Tag, X } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import type { Lead } from "@/lib/types";

export function TagsEditor({ lead, onSaved }: { lead: Lead; onSaved: () => void | Promise<void> }) {
  const repo = getRepo();
  const [tags, setTags] = useState<string[]>(lead.tags ?? []);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);

  const persist = async (next: string[]) => {
    setBusy(true);
    try {
      await repo.update(lead.id, { tags: next });
      setTags(next);
      await onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar tags");
    } finally {
      setBusy(false);
    }
  };

  const add = async () => {
    const t = input.trim().toLowerCase();
    setInput("");
    if (!t || tags.includes(t)) return;
    await persist([...tags, t]);
  };

  const remove = (t: string) => persist(tags.filter((x) => x !== t));

  return (
    <div className="border-t border-border p-6 sm:p-7">
      <div className="mb-3 flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-faint">
        <Tag size={15} /> Tags
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {tags.map((t) => (
          <span
            key={t}
            className="flex items-center gap-1 rounded-full bg-brand-50 py-1 pl-2.5 pr-1.5 text-[12.5px] font-semibold text-brand"
          >
            {t}
            <button
              type="button"
              onClick={() => remove(t)}
              disabled={busy}
              aria-label={`Remover tag ${t}`}
              className="flex size-4 items-center justify-center rounded-full hover:bg-brand/20"
            >
              <X size={11} />
            </button>
          </span>
        ))}
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              void add();
            }
          }}
          onBlur={() => void add()}
          disabled={busy}
          placeholder={tags.length ? "+ tag" : "Adicionar tag (ex: indicação, VIP)"}
          className="min-w-[140px] flex-1 rounded-full border border-border-2 bg-surface-2 px-3 py-1 text-[12.5px] outline-none focus:border-brand"
        />
      </div>
    </div>
  );
}
