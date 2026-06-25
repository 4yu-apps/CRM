"use client";
// #18 — Biblioteca de templates de mensagem. CRUD + preview com dados de exemplo.
// Variaveis {nome}/{ramo}/{bairro}/{cidade} sao substituidas ao usar num lead
// (ficha). Aqui o dono cria/edita/remove os modelos.
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { ChatText, Plus, Trash, PencilSimple, Copy, X } from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { TEMPLATE_KIND_LABEL, TEMPLATE_KINDS, TEMPLATE_VARS, fillSample } from "@/lib/templates";
import type { MessageTemplate, MessageTemplateKind } from "@/lib/types";

const empty = { id: "", name: "", body: "", kind: "abertura" as MessageTemplateKind };

export default function TemplatesPage() {
  const repo = useMemo(() => getRepo(), []);
  const [list, setList] = useState<MessageTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(empty);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setList(await repo.listTemplates());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar templates");
    } finally {
      setLoading(false);
    }
  }, [repo]);

  useEffect(() => {
    // Carga inicial do repositorio; load controla os estados de resultado/loading.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const reset = () => {
    setForm(empty);
    setEditing(false);
  };

  const startEdit = (t: MessageTemplate) => {
    setForm({ id: t.id, name: t.name, body: t.body, kind: t.kind });
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.warning("Preencha nome e corpo do template.");
      return;
    }
    setSaving(true);
    try {
      const input = { name: form.name.trim(), body: form.body, kind: form.kind };
      if (editing && form.id) {
        await repo.updateTemplate(form.id, input);
        toast.success("Template atualizado.");
      } else {
        await repo.saveTemplate(input);
        toast.success("Template criado.");
      }
      reset();
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar template");
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: string) => {
    try {
      await repo.deleteTemplate(id);
      setList((l) => l.filter((t) => t.id !== id));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao remover template");
    }
  };

  const copy = async (body: string) => {
    try {
      await navigator.clipboard.writeText(fillSample(body));
      toast.success("Copiado (com dados de exemplo).");
    } catch {
      toast.error("Não consegui copiar.");
    }
  };

  const insertVar = (v: string) => setForm((f) => ({ ...f, body: `${f.body}${v}` }));

  return (
    <div className="mx-auto max-w-[900px] space-y-5">
      <div>
        <h1 className="font-heading text-2xl font-bold">Templates de mensagem</h1>
        <p className="text-[13.5px] text-muted-foreground">
          Modelos reutilizáveis com variáveis. Use num lead pela ficha e o {"{nome}"}, {"{ramo}"}, {"{bairro}"} e {"{cidade}"} entram sozinhos.
        </p>
      </div>

      {/* editor */}
      <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold">
          {editing ? <PencilSimple size={17} className="text-brand" /> : <Plus size={17} className="text-brand" />}
          {editing ? "Editar template" : "Novo template"}
          {editing && (
            <button type="button" onClick={reset} className="ml-auto flex items-center gap-1 text-[12.5px] font-semibold text-faint hover:text-ink-2">
              <X size={13} /> cancelar edição
            </button>
          )}
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-3">
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Nome (ex: Abertura barbearia)"
              className="min-w-[220px] flex-1 rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
            />
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as MessageTemplateKind }))}
              className="rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm outline-none focus:border-brand"
            >
              {TEMPLATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {TEMPLATE_KIND_LABEL[k]}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[11.5px] font-semibold text-faint">Variáveis:</span>
            {TEMPLATE_VARS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => insertVar(v)}
                className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[11.5px] font-semibold text-brand hover:bg-brand-50"
              >
                {v}
              </button>
            ))}
          </div>
          <textarea
            value={form.body}
            onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
            rows={4}
            placeholder="oi {nome}, tudo bem? vi a {ramo} de voces no {bairro}..."
            className="w-full resize-none rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
          />
          {form.body.trim() && (
            <div className="rounded-[12px] bg-[var(--inset)] p-3 text-[13px] text-ink-2">
              <div className="mb-1 text-[11px] font-bold uppercase tracking-wider text-faint">Preview</div>
              <div className="whitespace-pre-wrap">{fillSample(form.body)}</div>
            </div>
          )}
          <div>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-[12px] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50"
              style={{ background: "var(--grad)" }}
            >
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Criar template"}
            </button>
          </div>
        </div>
      </div>

      {/* lista */}
      <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
        <div className="mb-4 flex items-center gap-2 text-[15px] font-bold">
          <ChatText size={17} className="text-brand" /> Meus templates
          <span className="ml-1 text-[12.5px] font-normal text-faint">({list.length})</span>
        </div>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum template ainda. Crie o primeiro acima.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {list.map((t) => (
              <div key={t.id} className="rounded-[12px] border border-border bg-surface-2 p-4">
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="text-[14px] font-bold">{t.name}</span>
                  <span className="rounded-full bg-brand-50 px-2 py-0.5 text-[10.5px] font-bold text-brand">
                    {TEMPLATE_KIND_LABEL[t.kind]}
                  </span>
                  <div className="ml-auto flex items-center gap-1">
                    <button type="button" onClick={() => copy(t.body)} aria-label="Copiar" className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-accent hover:text-brand">
                      <Copy size={15} />
                    </button>
                    <button type="button" onClick={() => startEdit(t)} aria-label="Editar" className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-accent hover:text-brand">
                      <PencilSimple size={15} />
                    </button>
                    <button type="button" onClick={() => remove(t.id)} aria-label="Remover" className="flex size-7 items-center justify-center rounded-lg text-faint hover:bg-danger-bg hover:text-danger">
                      <Trash size={15} />
                    </button>
                  </div>
                </div>
                <p className="whitespace-pre-wrap text-[13px] text-ink-2">{t.body}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
