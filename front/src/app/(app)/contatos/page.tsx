"use client";
import { useMemo, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  MagnifyingGlass,
  Spinner,
  Archive,
  ArrowCounterClockwise,
  Trash,
  AddressBook,
  InstagramLogo,
  WhatsappLogo,
  Globe,
  X,
  Download,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { STATUS_META, STATUS_ORDER, TONE_CLASSES } from "@/lib/state-machine";
import { SERVICE_META } from "@/lib/service";
import { fmtRelative } from "@/lib/format";
import type { Lead, LeadStatus } from "@/lib/types";
import { RAMOS_DISPONIVEIS } from "@/lib/ramos";
import { Dropdown, type DropdownOption } from "@/components/dropdown";
import { cn } from "@/lib/utils";

type SortKey = "recent" | "name" | "score";

const SORTS: { value: SortKey; label: string }[] = [
  { value: "recent", label: "Mais recentes" },
  { value: "name", label: "Nome (A-Z)" },
  { value: "score", label: "Maior score" },
];

function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

// Casa a busca por nome, cidade, telefone/whatsapp, dono ou categoria.
function matchesQuery(lead: Lead, q: string): boolean {
  if (!q) return true;
  const needle = q.trim().toLowerCase();
  const num = needle.replace(/\D/g, "");
  const haystack = [
    lead.business_name,
    lead.city,
    lead.state,
    lead.owner_name,
    lead.category,
    lead.instagram,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (haystack.includes(needle)) return true;
  if (num && (digits(lead.phone).includes(num) || digits(lead.whatsapp).includes(num))) return true;
  return false;
}

function waUrl(phone?: string | null): string | undefined {
  const d = digits(phone);
  if (!d) return undefined;
  return `https://wa.me/${d.startsWith("55") ? d : "55" + d}`;
}
function igUrl(handle?: string | null): string | undefined {
  const h = (handle ?? "").trim().replace(/^@/, "");
  return h ? `https://instagram.com/${h}` : undefined;
}
function siteUrl(site?: string | null): string | undefined {
  const s = (site ?? "").trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

function StatusBadge({ status }: { status: LeadStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={cn("inline-flex rounded-full px-2.5 py-0.5 text-[11.5px] font-semibold", TONE_CLASSES[meta.tone])}>
      {meta.label}
    </span>
  );
}

// Icone-link de contato; para a propagacao pra nao abrir a ficha ao clicar.
function ContactIcon({ href, title, children }: { href?: string; title: string; children: React.ReactNode }) {
  if (!href) return null;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title={title}
      onClick={(e) => e.stopPropagation()}
      className="flex size-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-brand"
    >
      {children}
    </a>
  );
}

export default function ContatosPage() {
  const router = useRouter();
  const { leads, loading, refresh, repo } = useLeads();

  const [q, setQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<LeadStatus | "">("");
  const [ramoFilter, setRamoFilter] = useState<string>("");
  const [showArchived, setShowArchived] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Lead | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Acoes em massa (sobre a selecao).
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);

  const filtered = useMemo(() => {
    const out = leads
      .filter((l) => (showArchived ? true : !l.archived))
      .filter((l) => (statusFilter ? l.status === statusFilter : true))
      .filter((l) => (ramoFilter ? l.category === ramoFilter : true))
      .filter((l) => matchesQuery(l, q));
    out.sort((a, b) => {
      if (sort === "name") return (a.business_name ?? "").localeCompare(b.business_name ?? "");
      if (sort === "score") return (b.score ?? -1) - (a.score ?? -1);
      return +new Date(b.updated_at) - +new Date(a.updated_at);
    });
    return out;
  }, [leads, q, statusFilter, ramoFilter, showArchived, sort]);

  // Contagem por status (entre os nao-arquivados) pro filtro mostrar so o que existe.
  const statusCounts = useMemo(() => {
    const m = new Map<LeadStatus, number>();
    for (const l of leads) {
      if (!showArchived && l.archived) continue;
      m.set(l.status, (m.get(l.status) ?? 0) + 1);
    }
    return m;
  }, [leads, showArchived]);

  // Opcoes dos dropdowns (visual proprio, ver components/dropdown).
  const statusOptions: DropdownOption[] = useMemo(
    () => [
      { value: "", label: "Todos os status" },
      ...STATUS_ORDER.map((s) => {
        const n = statusCounts.get(s) ?? 0;
        return { value: s, label: STATUS_META[s].label, hint: n ? `(${n})` : undefined };
      }),
    ],
    [statusCounts],
  );
  const ramoOptions: DropdownOption[] = useMemo(
    () => [{ value: "", label: "Todos os ramos" }, ...RAMOS_DISPONIVEIS.map((r) => ({ value: r, label: r }))],
    [],
  );
  const sortOptions: DropdownOption[] = SORTS.map((s) => ({ value: s.value, label: s.label }));

  const toggleSelect = useCallback((leadId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(leadId)) {
        next.delete(leadId);
      } else {
        next.add(leadId);
      }
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === filtered.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(filtered.map((l) => l.id)));
    }
  }, [filtered, selected.size]);

  const exportCsv = useCallback(() => {
    if (selected.size === 0) {
      toast.error("Selecione pelo menos um contato");
      return;
    }
    const toExport = filtered.filter((l) => selected.has(l.id));
    const headers = ["Negocio", "Status", "Categoria", "Cidade/Estado", "Telefone", "WhatsApp", "Instagram", "Site", "Score"];
    const rows = toExport.map((l) => [
      l.business_name ?? "",
      STATUS_META[l.status].label,
      l.category ?? "",
      [l.city, l.state].filter(Boolean).join("/") || "",
      l.phone ?? "",
      l.whatsapp ?? "",
      l.instagram ?? "",
      l.website ?? "",
      l.score ?? "",
    ]);
    const csv = [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `contatos-${new Date().toISOString().split("T")[0]}.csv`;
    link.click();
    toast.success(`Exportados ${selected.size} contatos`);
  }, [filtered, selected]);

  const toggleArchive = useCallback(
    async (lead: Lead) => {
      setBusyId(lead.id);
      try {
        await repo.setArchived(lead.id, !lead.archived);
        await refresh();
        toast.success(lead.archived ? "Contato reativado" : "Contato arquivado");
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
      } finally {
        setBusyId(null);
      }
    },
    [repo, refresh],
  );

  // Arquiva todos os selecionados de uma vez.
  const bulkArchive = useCallback(async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => repo.setArchived(id, true)));
      await refresh();
      toast.success(`${ids.length} ${ids.length === 1 ? "contato arquivado" : "contatos arquivados"}`);
      setSelected(new Set());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
    } finally {
      setBulkBusy(false);
    }
  }, [selected, repo, refresh]);

  // Exclui todos os selecionados (apos confirmacao).
  const bulkDelete = useCallback(async () => {
    if (selected.size === 0) return;
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await Promise.all(ids.map((id) => repo.remove(id)));
      await refresh();
      toast.success(`${ids.length} ${ids.length === 1 ? "contato excluido" : "contatos excluidos"}`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setBulkBusy(false);
    }
  }, [selected, repo, refresh]);

  const doDelete = useCallback(async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await repo.remove(confirmDelete.id);
      await refresh();
      toast.success("Contato excluido");
      setConfirmDelete(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
    } finally {
      setDeleting(false);
    }
  }, [confirmDelete, repo, refresh]);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1180px] items-center justify-center py-24">
        <Spinner size={28} className="animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1180px]">
      {/* Barra de ferramentas */}
      <div className="mb-4 flex flex-col gap-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <MagnifyingGlass size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome, cidade, telefone..."
              className="w-full rounded-xl border border-border-2 bg-surface-2 py-3 pl-10 pr-4 text-[14px] text-ink outline-none focus:border-brand"
            />
          </div>
          <div className="flex flex-wrap gap-2.5">
            <Dropdown
              value={statusFilter}
              onChange={(v) => setStatusFilter((v as LeadStatus) || "")}
              options={statusOptions}
              ariaLabel="Filtrar por status"
              className="min-w-[170px]"
            />
            <Dropdown
              value={ramoFilter}
              onChange={setRamoFilter}
              options={ramoOptions}
              ariaLabel="Filtrar por ramo"
              className="min-w-[160px]"
            />
            <Dropdown
              value={sort}
              onChange={(v) => setSort(v as SortKey)}
              options={sortOptions}
              ariaLabel="Ordenar"
              className="min-w-[150px]"
            />
            <button
              type="button"
              onClick={() => setShowArchived((v) => !v)}
              className={cn(
                "flex items-center gap-1.5 rounded-xl border px-4 py-3 text-[13px] font-semibold transition-colors",
                showArchived
                  ? "border-brand bg-brand-50 text-brand"
                  : "border-border-2 bg-surface-2 text-muted-foreground hover:text-ink",
              )}
              title="Mostrar/ocultar arquivados"
            >
              <Archive size={15} weight={showArchived ? "fill" : "regular"} />
              <span className="hidden sm:inline">Arquivados</span>
            </button>
          </div>
        </div>
        {selected.size > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand/30 bg-brand-50 px-4 py-3">
            <div className="flex-1 text-sm font-semibold text-brand">
              {selected.size} selecionado{selected.size !== 1 ? "s" : ""}
            </div>
            <button
              type="button"
              onClick={exportCsv}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-600 disabled:opacity-60"
            >
              <Download size={14} />
              Exportar CSV
            </button>
            <button
              type="button"
              onClick={() => void bulkArchive()}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-lg border border-border-2 bg-white px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              {bulkBusy ? <Spinner size={14} className="animate-spin" /> : <Archive size={14} />}
              Arquivar
            </button>
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3.5 py-2 text-sm font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:opacity-60"
            >
              <Trash size={14} />
              Excluir
            </button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              disabled={bulkBusy}
              className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-ink-2 transition-colors hover:bg-white disabled:opacity-60"
            >
              <X size={14} />
              Limpar
            </button>
          </div>
        )}
      </div>

      <div className="mb-3 text-[13px] text-muted-foreground">
        {filtered.length} {filtered.length === 1 ? "contato" : "contatos"}
        {statusFilter ? ` em ${STATUS_META[statusFilter].label}` : ""}
        {q ? ` para "${q}"` : ""}
      </div>

      {/* Lista / tabela */}
      <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--shadow)]">
        {/* Cabecalho (desktop) */}
        <div className="hidden grid-cols-[auto_2.4fr_1fr_1.1fr_1fr_0.6fr_0.9fr_auto] gap-3 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wider text-faint lg:grid lg:items-center">
          <input
            type="checkbox"
            checked={selected.size > 0 && selected.size === filtered.length}
            onChange={selectAll}
            className="h-4 w-4 cursor-pointer rounded"
          />
          <span>Negocio</span>
          <span>Status</span>
          <span>Local</span>
          <span>Contato</span>
          <span>Score</span>
          <span>Atualizado</span>
          <span className="text-right">Acoes</span>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <AddressBook size={38} className="text-faint" />
            <div className="text-[15px] font-semibold text-ink">Nenhum contato encontrado</div>
            <p className="max-w-[320px] text-[13px] text-muted-foreground">
              Ajuste a busca ou o filtro. Novos contatos chegam pela esteira e pela tela Buscar.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {filtered.map((lead) => (
              <div
                key={lead.id}
                className="group grid cursor-pointer grid-cols-1 gap-2 px-5 py-3.5 transition-colors hover:bg-accent/40 lg:grid-cols-[auto_2.4fr_1fr_1.1fr_1fr_0.6fr_0.9fr_auto] lg:items-center lg:gap-3"
              >
                <div className="hidden lg:flex">
                  <input
                    type="checkbox"
                    checked={selected.has(lead.id)}
                    onChange={() => toggleSelect(lead.id)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 cursor-pointer rounded"
                  />
                </div>
                <div
                  onClick={() => router.push(`/ficha/${lead.id}`)}
                  className="contents"
                >
                {/* Negocio */}
                <div className="min-w-0">
                  <div className="truncate text-[14.5px] font-semibold text-ink">
                    {lead.business_name ?? "(sem nome)"}
                  </div>
                  {(lead.category || lead.owner_name) && (
                    <div className="truncate text-[12px] text-faint">
                      {[lead.category, lead.owner_name].filter(Boolean).join(" · ")}
                    </div>
                  )}
                </div>

                {/* Status (mobile: inline) */}
                <div className="lg:block">
                  <StatusBadge status={lead.status} />
                  {lead.archived && (
                    <span className="ml-2 text-[11px] font-semibold text-faint">arquivado</span>
                  )}
                </div>

                {/* Local */}
                <div className="truncate text-[13px] text-ink-2">
                  {[lead.city, lead.state].filter(Boolean).join(" / ") || "-"}
                </div>

                {/* Contato */}
                <div className="flex items-center gap-1">
                  <ContactIcon href={waUrl(lead.whatsapp ?? lead.phone)} title="WhatsApp">
                    <WhatsappLogo size={16} weight="fill" />
                  </ContactIcon>
                  <ContactIcon href={igUrl(lead.instagram)} title="Instagram">
                    <InstagramLogo size={16} />
                  </ContactIcon>
                  <ContactIcon href={siteUrl(lead.website)} title="Site">
                    <Globe size={16} />
                  </ContactIcon>
                  {!lead.whatsapp && !lead.phone && !lead.instagram && !lead.website && (
                    <span className="text-[12px] text-faint">-</span>
                  )}
                </div>

                {/* Score */}
                <div className="text-[13px] font-semibold text-ink-2">
                  {lead.score ?? "-"}
                  <span className="ml-1.5 hidden text-[10.5px] font-medium lg:inline">
                    <span className={cn("rounded px-1 py-0.5", SERVICE_META[lead.service_target].badge)}>
                      {SERVICE_META[lead.service_target].short}
                    </span>
                  </span>
                </div>

                {/* Atualizado */}
                <div className="text-[12.5px] text-faint">{fmtRelative(lead.updated_at)}</div>

                {/* Acoes */}
                <div className="flex items-center justify-end gap-1">
                  <button
                    type="button"
                    disabled={busyId === lead.id}
                    onClick={(e) => {
                      e.stopPropagation();
                      void toggleArchive(lead);
                    }}
                    title={lead.archived ? "Reativar" : "Arquivar"}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-ink disabled:opacity-50"
                  >
                    {lead.archived ? <ArrowCounterClockwise size={16} /> : <Archive size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setConfirmDelete(lead);
                    }}
                    title="Excluir"
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600"
                  >
                    <Trash size={16} />
                  </button>
                </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal de confirmacao de exclusao */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setConfirmDelete(null)}>
          <div
            className="w-full max-w-[400px] rounded-[18px] border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[16px] font-bold">Excluir contato?</div>
              <button type="button" onClick={() => setConfirmDelete(null)} className="text-faint hover:text-ink">
                <X size={18} />
              </button>
            </div>
            <p className="mb-5 text-[13.5px] text-muted-foreground">
              <strong className="text-ink">{confirmDelete.business_name ?? "Este contato"}</strong> e todo o
              historico/proveniencia serao apagados de vez. Se quiser so tirar da lista, prefira{" "}
              <strong>arquivar</strong>.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => void doDelete()}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-rose-600 p-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {deleting ? <Spinner size={16} className="animate-spin" /> : <Trash size={16} />}
                {deleting ? "Excluindo..." : "Excluir de vez"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="rounded-[13px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de confirmacao de exclusao em massa */}
      {confirmBulkDelete && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !bulkBusy && setConfirmBulkDelete(false)}
        >
          <div
            className="w-full max-w-[420px] rounded-[18px] border border-border bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-1 flex items-center justify-between">
              <div className="text-[16px] font-bold">
                Excluir {selected.size} {selected.size === 1 ? "contato" : "contatos"}?
              </div>
              <button
                type="button"
                onClick={() => !bulkBusy && setConfirmBulkDelete(false)}
                className="text-faint hover:text-ink"
              >
                <X size={18} />
              </button>
            </div>
            <p className="mb-5 text-[13.5px] text-muted-foreground">
              Todos os selecionados e seu historico/proveniencia serao apagados de vez. Se quiser so
              tirar da lista, use <strong>Arquivar</strong>.
            </p>
            <div className="flex gap-2.5">
              <button
                type="button"
                onClick={() => void bulkDelete()}
                disabled={bulkBusy}
                className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-rose-600 p-3 text-sm font-bold text-white disabled:opacity-60"
              >
                {bulkBusy ? <Spinner size={16} className="animate-spin" /> : <Trash size={16} />}
                {bulkBusy ? "Excluindo..." : "Excluir de vez"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkBusy}
                className="rounded-[13px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2 disabled:opacity-60"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
