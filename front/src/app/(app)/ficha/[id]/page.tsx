"use client";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  Barbell,
  Buildings,
  CalendarX,
  Check,
  CheckCircle,
  Coffee,
  Copy,
  CurrencyCircleDollar,
  ForkKnife,
  Hamburger,
  Info,
  MagnifyingGlass,
  MapPin,
  NotePencil,
  PawPrint,
  PencilSimple,
  ProhibitInset,
  Scissors,
  ShieldWarning,
  Sparkle,
  Star,
  Storefront,
  Tooth,
  Trash,
  Warning,
  WhatsappLogo,
  X,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { FollowupCard } from "@/components/followup-card";
import { LeadFiles } from "@/components/lead-files";
import { TagsEditor } from "@/components/tags-editor";
import { waSend, openWhatsApp } from "@/lib/whatsapp";
import { Skeleton } from "@/components/skeleton";
import { googleSearchUrl, googleMapsUrl } from "@/lib/links";
import { siteSignalChips, signalChipClass } from "@/lib/site-signals";
import { useCancelMeeting } from "@/hooks/use-cancel-meeting";
import { SERVICE_META } from "@/lib/service";
import { STATUS_META, TONE_CLASSES } from "@/lib/state-machine";
import {
  fmtPhone,
  fmtCnpj,
  fmtDateTime,
  fmtRelative,
  sourceLabel,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import type {
  DealBilling,
  FieldProvenance,
  Lead,
  LeadDetail,
  LeadEditable,
  SiteSignals,
} from "@/lib/types";

// ---------------------------------------------------------------------------
// Icone por categoria (espelho do fila/page)
// ---------------------------------------------------------------------------
function LeadIcon({ category, size }: { category: string | null; size: number }) {
  const c = (category ?? "").toLowerCase();
  if (c.includes("hamburg")) return <Hamburger size={size} />;
  if (c.includes("barbear")) return <Scissors size={size} />;
  if (c.includes("pet")) return <PawPrint size={size} />;
  if (c.includes("restaur")) return <ForkKnife size={size} />;
  if (c.includes("academ")) return <Barbell size={size} />;
  if (c.includes("odont")) return <Tooth size={size} />;
  if (c.includes("cafe") || c.includes("café")) return <Coffee size={size} />;
  if (c.includes("estetic") || c.includes("estet")) return <Sparkle size={size} />;
  return <Storefront size={size} />;
}

// ---------------------------------------------------------------------------
// Formatadores de moeda e deal
// ---------------------------------------------------------------------------
function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function dealBillingLabel(billing: DealBilling | null | undefined, months: number | null | undefined): string {
  if (billing === "por_prazo") return `Por prazo${months ? ` (${months} meses)` : ""}`;
  if (billing === "mensal_fixo") return "Mensal fixo";
  return "-";
}

// ---------------------------------------------------------------------------
// Fonte de um campo (provenance)
// ---------------------------------------------------------------------------
function provOf(provenance: FieldProvenance[], field: string): string | null {
  const p = provenance.find((x) => x.field_name === field);
  return p ? sourceLabel(p.source) : null;
}

// ---------------------------------------------------------------------------
// Campo do formulario de edicao
// ---------------------------------------------------------------------------
function EditField({
  label,
  value,
  onChange,
  placeholder,
  prov,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  prov?: string | null;
}) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-wider text-faint">{label}</label>
        {prov && (
          <span className="text-[10px] text-faint">via {prov}</span>
        )}
      </div>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder ?? label}
        className="w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Linha de dado (leitura) com fonte
// ---------------------------------------------------------------------------
function DataRow({ label, value, prov, href }: { label: string; value: string; prov?: string | null; href?: string }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3 last:border-0">
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
      <div className="min-w-0 text-right">
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="break-all text-[13.5px] font-semibold text-brand hover:underline"
          >
            {value}
          </a>
        ) : (
          <span className="text-[13.5px] font-semibold text-ink">{value}</span>
        )}
        {prov && (
          <span className="ml-1.5 text-[11px] text-faint">via {prov}</span>
        )}
      </div>
    </div>
  );
}

// Monta os links (abrem em nova aba). Retorna undefined quando nao da pra linkar.
function igUrl(handle?: string | null): string | undefined {
  const h = (handle ?? "").trim().replace(/^@/, "");
  return h ? `https://instagram.com/${h}` : undefined;
}
function mailUrl(email?: string | null): string | undefined {
  const e = (email ?? "").trim();
  return e ? `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(e)}` : undefined;
}
function siteUrl(site?: string | null): string | undefined {
  const s = (site ?? "").trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}
function waUrl(phone?: string | null): string | undefined {
  return waSend(phone);
}
function fbUrl(handle?: string | null): string | undefined {
  const h = (handle ?? "").trim().replace(/^@/, "").replace(/\/+$/, "");
  if (!h) return undefined;
  return /^https?:\/\//i.test(h) ? h : `https://facebook.com/${h}`;
}
// Biblioteca de Anuncios da Meta JA pesquisada pelo negocio (Brasil, todos os
// anuncios). Sem API: e a checagem manual — abre o site publico (sem login) com
// o nome do negocio (ou @ do Instagram) pro Eduardo ver se o lead anuncia.
function adLibraryUrl(lead: { business_name: string | null; instagram: string | null }): string | undefined {
  const term = (lead.business_name || lead.instagram || "").replace(/^@/, "").trim();
  if (!term) return undefined;
  const p = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: "BR",
    q: term,
    search_type: "keyword_unordered",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${p.toString()}`;
}
// ISO -> valor do <input type="datetime-local"> (local, sem timezone).
function toLocalInput(iso?: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ---------------------------------------------------------------------------
// Calcula quantos dias o lead esta no status atual
// ---------------------------------------------------------------------------
function daysInStatus(history: { changed_at: string }[]): number | null {
  if (history.length === 0) return null;
  // history vem ordenado do mais recente pro mais antigo (ascending: false no repo)
  const last = new Date(history[0].changed_at);
  if (Number.isNaN(last.getTime())) return null;
  const now = new Date();
  return Math.floor((now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24));
}

function statusAgeLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days === 0) return "hoje neste status";
  if (days === 1) return "há 1 dia neste status";
  return `há ${days} dias neste status`;
}

// ---------------------------------------------------------------------------
// Painel de diagnostico do site
// ---------------------------------------------------------------------------
function SiteSignalsPanel({ signals, since }: { signals: SiteSignals; since?: string | null }) {
  const chips = siteSignalChips(signals);
  if (chips.length === 0) return null;

  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-faint">Diagnóstico do site</span>
        {since && (
          <span className="text-[11px] text-faint" title="Quando o robô conferiu por último">
            verificado {fmtRelative(since)}
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-2">
        {chips.map((chip, i) => (
          <span key={i} className={cn("rounded-full px-2.5 py-1 text-[12px]", signalChipClass(chip.variant))}>
            {chip.label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Estado de loading / erro / nao encontrado
// ---------------------------------------------------------------------------
function StateScreen({ icon, title, sub }: { icon: React.ReactNode; title: string; sub?: string }) {
  return (
    <div className="mx-auto mt-20 max-w-[480px] rounded-[22px] border border-border bg-card p-12 text-center shadow-[var(--shadow)]">
      <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[18px] bg-muted text-muted-foreground">
        {icon}
      </div>
      <div className="font-heading text-xl font-bold">{title}</div>
      {sub && <p className="mt-2 text-sm text-muted-foreground">{sub}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------
export default function FichaPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id ?? "";
  const router = useRouter();
  const repo = getRepo();

  const [detail, setDetail] = useState<LeadDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Modo edicao
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LeadEditable>({});
  const [saving, setSaving] = useState(false);

  // Modal de confirmacao de exclusao
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Anotacoes (B8)
  const [notesEdit, setNotesEdit] = useState(false);
  const [notesVal, setNotesVal] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const d = await repo.detail(id);
      setDetail(d);
      setNotesVal(d.lead.notes ?? "");
    } catch {
      setNotFound(true);
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const { cancelMeeting, cancelling } = useCancelMeeting(load);

  // ----------- Acoes -----------

  const startEdit = useCallback((lead: Lead) => {
    setForm({
      business_name: lead.business_name ?? "",
      phone: lead.phone ?? "",
      whatsapp: lead.whatsapp ?? "",
      email: lead.email ?? "",
      instagram: lead.instagram ?? "",
      facebook: lead.facebook ?? "",
      website: lead.website ?? "",
      category: lead.category ?? "",
      address: lead.address ?? "",
      neighborhood: lead.neighborhood ?? "",
      city: lead.city ?? "",
      state: lead.state ?? "",
      owner_name: lead.owner_name ?? "",
      meeting_at: lead.meeting_at ?? null,
      meeting_link: lead.meeting_link ?? "",
      meeting_location: lead.meeting_location ?? "",
    });
    setEditing(true);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!detail) return;
    setSaving(true);
    try {
      const updated = await repo.update(detail.lead.id, form);
      setDetail((prev) => prev ? { ...prev, lead: updated } : prev);
      setEditing(false);
      toast.success("Dados salvos.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  }, [detail, form, repo]);

  const saveNotes = useCallback(async () => {
    if (!detail) return;
    setSavingNotes(true);
    try {
      const updated = await repo.update(detail.lead.id, { notes: notesVal });
      setDetail((prev) => prev ? { ...prev, lead: updated } : prev);
      setNotesEdit(false);
      toast.success("Anotação salva.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar anotação");
    } finally {
      setSavingNotes(false);
    }
  }, [detail, notesVal, repo]);

  const toggleOptOut = useCallback(async (value: boolean) => {
    if (!detail) return;
    try {
      const updated = await repo.setOptOut(detail.lead.id, value);
      setDetail((prev) => prev ? { ...prev, lead: updated } : prev);
      toast.success(value ? "Opt-out ativado. Contato bloqueado (LGPD)." : "Opt-out removido.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao alterar opt-out");
    }
  }, [detail, repo]);

  const toggleArchived = useCallback(async () => {
    if (!detail) return;
    const next = !detail.lead.archived;
    try {
      const updated = await repo.setArchived(detail.lead.id, next);
      setDetail((prev) => prev ? { ...prev, lead: updated } : prev);
      toast.success(next ? "Lead arquivado." : "Lead reativado da lista.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
    }
  }, [detail, repo]);

  const reactivate = useCallback(async () => {
    if (!detail) return;
    try {
      const updated = await repo.transition(detail.lead.id, "enriquecido", "human");
      const d = await repo.detail(updated.id);
      setDetail(d);
      toast.success("Lead reativado no funil.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao reativar");
    }
  }, [detail, repo]);

  const doDelete = useCallback(async () => {
    if (!detail) return;
    setDeleting(true);
    try {
      await repo.remove(detail.lead.id);
      toast.success("Lead excluído.");
      router.push("/fila");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao excluir");
      setDeleting(false);
      setConfirmDelete(false);
    }
  }, [detail, repo, router]);

  // ----------- Render -----------

  if (loading) {
    return (
      <div className="mx-auto max-w-[880px]">
        <Skeleton className="mb-5 h-5 w-28" />
        <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex items-center gap-4 border-b border-border p-6 sm:p-7">
            <Skeleton className="size-14 flex-none rounded-[16px]" />
            <div className="min-w-0 flex-1 space-y-2.5">
              <Skeleton className="h-6 w-1/2" />
              <Skeleton className="h-4 w-1/3" />
            </div>
          </div>
          <div className="space-y-3 p-6">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-5/6" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </div>
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <Skeleton className="h-40 rounded-[20px]" />
          <Skeleton className="h-40 rounded-[20px]" />
        </div>
      </div>
    );
  }

  if (notFound || !detail) {
    return (
      <div className="mx-auto max-w-[880px]">
        <StateScreen
          icon={<Warning size={30} />}
          title="Lead não encontrado"
          sub="O id informado não existe ou já foi excluído."
        />
        <div className="mt-6 text-center">
          <Link href="/fila" className="text-sm font-semibold text-brand hover:underline">
            Voltar pra fila
          </Link>
        </div>
      </div>
    );
  }

  const { lead, provenance, history } = detail;
  const service = SERVICE_META[lead.service_target] ?? SERVICE_META.indefinido;
  const statusMeta = STATUS_META[lead.status];
  const toneClass = TONE_CLASSES[statusMeta.tone];


  const statusAgeDays = daysInStatus(history);
  const statusAgeText = statusAgeLabel(statusAgeDays);



  return (
    <div className="mx-auto max-w-[880px]">
      {/* Breadcrumb */}
      <Link
        href="/fila"
        className="mb-5 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> Voltar pra fila
      </Link>

      {/* Cabecalho */}
      <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
        <div className="flex items-center gap-4 border-b border-border p-6 sm:p-7">
          <div className="flex size-14 flex-none items-center justify-center rounded-[16px] bg-brand-50 text-brand">
            <LeadIcon category={lead.category} size={28} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="font-heading text-2xl font-bold tracking-tight">{lead.business_name ?? "Sem nome"}</div>
              {lead.category && (
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                  {lead.category}
                </span>
              )}
              <span className={cn("rounded-full border px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", toneClass)}>
                {statusMeta.label}
              </span>
              <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", service.badge)}>
                {service.short}
              </span>
              {lead.match_rate != null && lead.match_rate < 0.4 && (
                <span
                  className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700"
                  title="Achei poucos canais de contato deste lead"
                >
                  Poucos contatos
                </span>
              )}
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-3.5 text-[13.5px] text-muted-foreground">
              {(lead.neighborhood || lead.city) && (
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} /> {[lead.neighborhood, lead.city].filter(Boolean).join(", ")}
                </span>
              )}
              {lead.rating != null && (
                <span className="flex items-center gap-1.5">
                  <Star size={14} weight="fill" className="text-[#E8A93B]" /> {lead.rating}{" "}
                  {lead.reviews_count != null && <span className="text-faint">({lead.reviews_count})</span>}
                </span>
              )}
              {statusAgeText && (
                <span className="text-[12px] text-faint">{statusAgeText}</span>
              )}
            </div>
          </div>
          {lead.archived && (
            <span className="rounded-full bg-muted px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Arquivado
            </span>
          )}
        </div>

        {/* Opt-out LGPD banner */}
        {lead.opt_out && (
          <div className="flex items-center gap-3 border-b border-danger-bg bg-danger-bg px-6 py-3.5 text-[13.5px] text-danger">
            <ShieldWarning size={18} weight="fill" />
            <span>
              <strong>Opt-out ativo.</strong> Este contato pediu pra não ser abordado (LGPD). Envio de mensagens bloqueado.
              {lead.opt_out_at && (
                <span className="ml-1.5 text-[12px] font-normal opacity-80">
                  Registrado {fmtRelative(lead.opt_out_at)}.
                </span>
              )}
            </span>
          </div>
        )}

        {/* Grid principal: dados + sinais */}
        <div className="grid grid-cols-1 gap-6 p-6 sm:p-7 lg:grid-cols-2">
          {/* Coluna esquerda: dados do negocio */}
          <div>
            <div className="mb-4 flex items-center justify-between">
              <div className="text-[12px] font-bold uppercase tracking-wider text-faint">Dados do negócio</div>
              {!editing && (
                <button
                  onClick={() => startEdit(lead)}
                  className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
                >
                  <PencilSimple size={14} /> Editar
                </button>
              )}
            </div>

            {editing ? (
              <div className="flex flex-col gap-3">
                <EditField label="Nome do negócio" value={form.business_name ?? ""} onChange={(v) => setForm((f) => ({ ...f, business_name: v }))} prov={provOf(provenance, "business_name")} />
                <EditField label="Dono / responsável" value={form.owner_name ?? ""} onChange={(v) => setForm((f) => ({ ...f, owner_name: v }))} prov={provOf(provenance, "owner_name")} />
                <EditField label="Telefone" value={form.phone ?? ""} onChange={(v) => setForm((f) => ({ ...f, phone: v }))} placeholder="(11) 99999-9999" prov={provOf(provenance, "phone")} />
                <EditField label="WhatsApp" value={form.whatsapp ?? ""} onChange={(v) => setForm((f) => ({ ...f, whatsapp: v }))} placeholder="(11) 99999-9999" prov={provOf(provenance, "whatsapp")} />
                <EditField label="E-mail" value={form.email ?? ""} onChange={(v) => setForm((f) => ({ ...f, email: v }))} prov={provOf(provenance, "email")} />
                <EditField label="Instagram" value={form.instagram ?? ""} onChange={(v) => setForm((f) => ({ ...f, instagram: v }))} placeholder="@handle" prov={provOf(provenance, "instagram")} />
                <EditField label="Facebook" value={form.facebook ?? ""} onChange={(v) => setForm((f) => ({ ...f, facebook: v }))} placeholder="pagina ou link" prov={provOf(provenance, "facebook")} />
                <EditField label="Website" value={form.website ?? ""} onChange={(v) => setForm((f) => ({ ...f, website: v }))} prov={provOf(provenance, "website")} />
                <EditField label="Categoria" value={form.category ?? ""} onChange={(v) => setForm((f) => ({ ...f, category: v }))} prov={provOf(provenance, "category")} />
                <EditField label="Endereço" value={form.address ?? ""} onChange={(v) => setForm((f) => ({ ...f, address: v }))} prov={provOf(provenance, "address")} />
                <EditField label="Bairro" value={form.neighborhood ?? ""} onChange={(v) => setForm((f) => ({ ...f, neighborhood: v }))} prov={provOf(provenance, "neighborhood")} />
                <EditField label="Cidade" value={form.city ?? ""} onChange={(v) => setForm((f) => ({ ...f, city: v }))} prov={provOf(provenance, "city")} />
                <EditField label="UF" value={form.state ?? ""} onChange={(v) => setForm((f) => ({ ...f, state: v }))} placeholder="SP" prov={provOf(provenance, "state")} />

                <div className="mt-1 border-t border-border pt-3 text-[11px] font-bold uppercase tracking-wider text-faint">
                  Reunião
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-faint">
                    Data e hora
                  </label>
                  <input
                    type="datetime-local"
                    value={toLocalInput(form.meeting_at)}
                    onChange={(e) =>
                      setForm((f) => ({
                        ...f,
                        meeting_at: e.target.value ? new Date(e.target.value).toISOString() : null,
                      }))
                    }
                    className="w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-sm text-ink outline-none focus:border-brand"
                  />
                </div>
                <EditField label="Link da reunião (online)" value={form.meeting_link ?? ""} onChange={(v) => setForm((f) => ({ ...f, meeting_link: v }))} placeholder="Meet, Zoom, Teams..." />
                <EditField label="Local (presencial)" value={form.meeting_location ?? ""} onChange={(v) => setForm((f) => ({ ...f, meeting_location: v }))} placeholder="Endereço do encontro" />

                <div className="mt-1 flex gap-2.5">
                  <button
                    onClick={saveEdit}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-2 rounded-[14px] p-3 text-sm font-bold text-white shadow-[0_4px_12px_var(--ring)] disabled:opacity-60"
                    style={{ background: "var(--grad)" }}
                  >
                    <Check size={16} weight="bold" /> {saving ? "Salvando..." : "Salvar"}
                  </button>
                  <button
                    onClick={() => setEditing(false)}
                    className="rounded-[14px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="overflow-hidden rounded-[14px] border border-border bg-card">
                <DataRow label="Dono / responsável" value={lead.owner_name ?? "-"} prov={provOf(provenance, "owner_name")} />
                <DataRow label="Telefone" value={fmtPhone(lead.phone)} prov={provOf(provenance, "phone")} />
                <DataRow label="WhatsApp" value={lead.whatsapp ? fmtPhone(lead.whatsapp) : "-"} href={waUrl(lead.whatsapp)} prov={provOf(provenance, "whatsapp")} />
                <DataRow label="E-mail" value={lead.email ?? "-"} href={mailUrl(lead.email)} prov={provOf(provenance, "email")} />
                <DataRow label="Instagram" value={lead.instagram ?? "-"} href={igUrl(lead.instagram)} prov={provOf(provenance, "instagram")} />
                <DataRow label="Facebook" value={lead.facebook ?? "-"} href={fbUrl(lead.facebook)} prov={provOf(provenance, "facebook")} />
                <DataRow label="CNPJ" value={fmtCnpj(lead.cnpj)} prov={provOf(provenance, "cnpj")} />
                <DataRow label="Site" value={lead.website ? lead.website : "Não tem"} href={siteUrl(lead.website)} prov={provOf(provenance, "website")} />
                <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
                  <span className="text-[13.5px] text-muted-foreground">Já anuncia?</span>
                  <div className="flex items-center gap-2 text-right">
                    <span className="text-[13.5px] font-semibold text-ink">
                      {lead.ads_active == null ? "Não sei" : lead.ads_active ? "Sim" : "Ainda não"}
                    </span>
                    {adLibraryUrl(lead) && (
                      <a
                        href={adLibraryUrl(lead)}
                        target="_blank"
                        rel="noopener noreferrer"
                        title="Conferir na Biblioteca de Anúncios da Meta (busca pelo nome do negócio)"
                        aria-label="Conferir na Biblioteca de Anúncios da Meta"
                        className="flex size-6 items-center justify-center rounded-md text-faint transition-colors hover:bg-accent hover:text-brand"
                      >
                        <MagnifyingGlass size={14} weight="bold" />
                      </a>
                    )}
                  </div>
                </div>
                <DataRow label="Endereço" value={lead.address ?? "-"} prov={provOf(provenance, "address")} />
                <DataRow label="Bairro" value={lead.neighborhood ?? "-"} prov={provOf(provenance, "neighborhood")} />
                <DataRow label="Cidade / UF" value={[lead.city, lead.state].filter(Boolean).join(" / ") || "-"} />
                <DataRow label="No Google" value="Pesquisar o negócio" href={googleSearchUrl(lead)} />
                <DataRow
                  label="No Maps"
                  value={lead.maps_url ? "Abrir no Google Maps" : "Procurar no Maps"}
                  href={googleMapsUrl(lead)}
                />
                {lead.meeting_at && !editing && (
                  <div className="flex items-center justify-between">
                    <DataRow label="Reunião" value={fmtDateTime(lead.meeting_at)} />
                    <button
                      type="button"
                      onClick={() => void cancelMeeting(lead)}
                      disabled={cancelling}
                      title="Cancelar reunião"
                      aria-label="Cancelar reunião"
                      className="ml-2 flex items-center gap-1 rounded-[8px] px-2.5 py-1 text-[12px] font-semibold text-rose-500 transition-colors hover:bg-rose-50 disabled:opacity-50"
                    >
                      <CalendarX size={14} weight="bold" />
                      Cancelar reunião
                    </button>
                  </div>
                )}
                {lead.meeting_link && (
                  <DataRow label="Link da reunião" value={lead.meeting_link} href={lead.meeting_link} />
                )}
                {lead.meeting_location && (
                  <DataRow label="Local da reunião" value={lead.meeting_location} />
                )}
              </div>
            )}
          </div>

          {/* Coluna direita: sinais + abordagem */}
          <div className="flex flex-col gap-5">
            {/* Sinais / score */}
            {lead.score_reason && (
              <div className="rounded-[14px] border border-brand-100 bg-brand-50 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                  <Sparkle size={15} weight="fill" /> Leitura dos sinais
                </div>
                {lead.score_reason.summary && (
                  <p className="mb-3 text-[14px] leading-relaxed text-ink-2">{lead.score_reason.summary}</p>
                )}
                {lead.score_reason.criteria.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {lead.score_reason.criteria.map((c, i) => (
                      <div key={i} className="flex items-center gap-2 text-[13px] text-ink-2">
                        <Check size={14} weight="bold" className="flex-none text-success" />
                        {c.note ?? c.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Diagnostico do site */}
            {lead.site_signals && (
              <SiteSignalsPanel signals={lead.site_signals} since={lead.updated_at} />
            )}

            {/* Valor sugerido pela IA (B8) */}
            {lead.suggested_value != null && (
              <div className="rounded-[14px] border border-border bg-surface-2 p-4">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
                  <CurrencyCircleDollar size={14} /> Valor sugerido pela IA
                </div>
                <div className="text-xl font-bold text-ink">{fmtBRL(lead.suggested_value)}</div>
                {lead.suggested_value_reason && (
                  <p className="mt-1.5 text-[13px] text-muted-foreground">{lead.suggested_value_reason}</p>
                )}
              </div>
            )}

            {/* Negocio fechado (B8) */}
            {lead.deal_value != null && (
              <div className="rounded-[14px] border border-success/30 bg-success-bg p-4">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-success">
                  <CheckCircle size={14} weight="fill" /> Negócio fechado
                </div>
                <div className="text-xl font-bold text-ink">{fmtBRL(lead.deal_value)}</div>
                <div className="mt-1 text-[13px] text-muted-foreground">
                  {dealBillingLabel(lead.deal_billing, lead.deal_term_months)}
                  {lead.deal_closed_at && (
                    <span className="ml-2 text-faint">em {fmtDateTime(lead.deal_closed_at)}</span>
                  )}
                </div>
              </div>
            )}

            {/* Motivo de perda (#17) */}
            {lead.loss_reason && (
              <div className="rounded-[14px] border border-border bg-surface-2 p-4">
                <div className="mb-1.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-faint">
                  <Archive size={14} /> Motivo da perda
                </div>
                <div className="text-[14px] font-semibold text-ink">{lead.loss_reason}</div>
              </div>
            )}

            {/* Follow-up: agendar a re-abordagem quando o lead nao responde */}
            {["enviado", "sem_resposta", "respondeu", "interessado", "reuniao", "proposta"].includes(lead.status) && (
              <FollowupCard lead={lead} onSaved={load} />
            )}

            {/* Abordagem escrita */}
            {(lead.draft_msg1 || lead.draft_msg2) && (
              <div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-faint">Abordagem escrita</div>
                <div className="flex flex-col gap-2.5">
                  {lead.draft_msg1 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-faint">1. Abertura</span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(lead.draft_msg1 ?? "");
                            toast.success("Copiado");
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          <Copy size={12} /> Copiar abertura
                        </button>
                      </div>
                      <div className="rounded-[12px] border border-border bg-surface-2 p-3.5 text-[13.5px] leading-relaxed text-ink-2">
                        {lead.draft_msg1}
                      </div>
                    </div>
                  )}
                  {lead.draft_msg2 && (
                    <div>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-[11px] font-semibold text-faint">2. Pitch</span>
                        <button
                          type="button"
                          onClick={() => {
                            void navigator.clipboard.writeText(lead.draft_msg2 ?? "");
                            toast.success("Copiado");
                          }}
                          className="flex items-center gap-1 text-[11px] font-semibold text-brand hover:underline"
                        >
                          <Copy size={12} /> Copiar pitch
                        </button>
                      </div>
                      <div className="rounded-[12px] border border-border bg-surface-2 p-3.5 text-[13.5px] leading-relaxed text-ink-2">
                        {lead.draft_msg2}
                      </div>
                    </div>
                  )}
                  {lead.phone && lead.draft_msg1 && (
                    <button
                      type="button"
                      onClick={() => openWhatsApp(lead.whatsapp ?? lead.phone, lead.draft_msg1 ?? undefined)}
                      className="flex items-center justify-center gap-2 rounded-[13px] p-3.5 text-sm font-bold text-white"
                      style={{ background: "var(--wa)" }}
                    >
                      <WhatsappLogo size={18} weight="fill" /> Abrir conversa no WhatsApp
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Anotacoes (B8) */}
        <div className="border-t border-border p-6 sm:p-7">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-faint">
              <NotePencil size={15} /> Anotações
            </div>
            {!notesEdit && (
              <button
                onClick={() => { setNotesEdit(true); setNotesVal(lead.notes ?? ""); }}
                className="flex items-center gap-1.5 text-[12.5px] font-semibold text-brand hover:underline"
              >
                <PencilSimple size={14} /> Editar
              </button>
            )}
          </div>
          {notesEdit ? (
            <div className="flex flex-col gap-3">
              <textarea
                value={notesVal}
                onChange={(e) => setNotesVal(e.target.value)}
                rows={4}
                placeholder="Notas livres: próximos passos, contexto, observações..."
                className="w-full resize-none rounded-xl border border-border-2 bg-surface-2 p-3.5 text-sm leading-relaxed text-ink outline-none focus:border-brand"
              />
              <div className="flex gap-2.5">
                <button
                  onClick={saveNotes}
                  disabled={savingNotes}
                  className="flex items-center gap-2 rounded-[13px] px-5 py-2.5 text-sm font-bold text-white disabled:opacity-60"
                  style={{ background: "var(--grad)" }}
                >
                  <Check size={15} weight="bold" /> {savingNotes ? "Salvando..." : "Salvar"}
                </button>
                <button
                  onClick={() => setNotesEdit(false)}
                  className="rounded-[13px] border border-border-2 bg-card px-5 py-2.5 text-sm font-semibold text-ink-2"
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : (
            <div
              className={cn(
                "min-h-[48px] rounded-[12px] p-3.5 text-[13.5px] leading-relaxed",
                lead.notes ? "border border-border bg-surface-2 text-ink-2" : "border border-dashed border-border text-faint",
              )}
            >
              {lead.notes || "Nenhuma anotação ainda. Clique em Editar pra adicionar."}
            </div>
          )}
        </div>

        {/* Tags (#20) */}
        <TagsEditor lead={lead} onSaved={load} />

        {/* Anexos do lead (contrato, etc.) */}
        <LeadFiles leadId={lead.id} />

        {/* Historico do funil */}
        {history.length > 0 && (
          <div className="border-t border-border p-6 sm:p-7">
            <div className="mb-4 text-[12px] font-bold uppercase tracking-wider text-faint">Histórico do funil</div>
            <div className="flex flex-col gap-0">
              {history.map((h, i) => {
                const toMeta = STATUS_META[h.to_status];
                const tc = TONE_CLASSES[toMeta.tone];
                return (
                  <div key={h.id} className="flex gap-3.5 pb-4 last:pb-0">
                    {/* linha da timeline */}
                    <div className="relative flex flex-col items-center">
                      <div className={cn("mt-0.5 flex size-7 flex-none items-center justify-center rounded-full border text-[11px] font-bold", tc)}>
                        {i + 1}
                      </div>
                      {i < history.length - 1 && (
                        <div className="mt-1 flex-1 w-px bg-border" />
                      )}
                    </div>
                    <div className="min-w-0 pb-1 pt-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        {h.from_status && (
                          <>
                            <span className="text-[12.5px] font-semibold text-muted-foreground">
                              {STATUS_META[h.from_status]?.label ?? h.from_status}
                            </span>
                            <ArrowRight size={13} className="text-faint" />
                          </>
                        )}
                        <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider border", tc)}>
                          {toMeta.label}
                        </span>
                        <span className="text-[11.5px] text-faint">
                          por {h.actor === "system" ? "sistema" : h.actor === "extension" ? "extensão" : "você"}
                        </span>
                      </div>
                      {h.note && (
                        <div className="mt-0.5 text-[13px] text-muted-foreground">{h.note}</div>
                      )}
                      <div className="mt-0.5 text-[11.5px] text-faint" title={h.changed_at}>
                        {fmtRelative(h.changed_at)} ({fmtDateTime(h.changed_at)})
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Acoes + LGPD */}
        <div className="border-t border-border p-6 sm:p-7">
          <div className="mb-4 text-[12px] font-bold uppercase tracking-wider text-faint">Ações</div>
          <div className="flex flex-wrap gap-3">
            {/* Reativar (so quando descartado) */}
            {lead.status === "descartado" && (
              <button
                onClick={reactivate}
                className="flex items-center gap-2 rounded-[13px] border border-brand bg-brand-50 px-4 py-2.5 text-sm font-bold text-brand transition-colors hover:bg-brand hover:text-white"
              >
                <ArrowRight size={16} /> Reativar lead
              </button>
            )}

            {/* Arquivar / Desarquivar */}
            <button
              onClick={toggleArchived}
              className="flex items-center gap-2 rounded-[13px] border border-border-2 bg-card px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2"
            >
              <Buildings size={16} /> {lead.archived ? "Tirar do arquivo" : "Arquivar"}
            </button>

            {/* Opt-out LGPD */}
            <button
              onClick={() => toggleOptOut(!lead.opt_out)}
              className={cn(
                "flex items-center gap-2 rounded-[13px] border px-4 py-2.5 text-sm font-semibold transition-colors",
                lead.opt_out
                  ? "border-success/40 bg-success-bg text-success hover:bg-success/10"
                  : "border-border-2 bg-card text-ink-2 hover:bg-surface-2",
              )}
            >
              <ProhibitInset size={16} />
              {lead.opt_out ? "Remover opt-out" : "Marcar opt-out (LGPD)"}
            </button>

            {/* Excluir */}
            <button
              onClick={() => setConfirmDelete(true)}
              className="flex items-center gap-2 rounded-[13px] border border-danger/30 bg-card px-4 py-2.5 text-sm font-semibold text-danger transition-colors hover:bg-danger-bg"
            >
              <Trash size={16} /> Excluir
            </button>
          </div>

          {/* Info LGPD */}
          <div className="mt-4 flex items-center gap-2 text-[12px] text-faint">
            <Info size={14} />
            Opt-out bloqueia qualquer contato com este lead (exigência da LGPD). Arquivar apenas remove da fila, sem apagar dados.
          </div>
        </div>
      </div>

      {/* Modal de confirmacao de exclusao */}
      {confirmDelete && (
        <div
          onClick={() => { if (!deleting) setConfirmDelete(false); }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-6 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[440px] max-w-full overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
            style={{ animation: "fadeUp .2s both" }}
          >
            <div className="flex items-center gap-3 px-6 pt-6">
              <div className="flex size-11 flex-none items-center justify-center rounded-[13px] bg-danger-bg text-danger">
                <Trash size={22} weight="fill" />
              </div>
              <div>
                <div className="text-base font-bold">Excluir este lead?</div>
                <div className="text-[13px] text-muted-foreground">
                  {lead.business_name ?? "Lead"} será removido de vez, sem volta.
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="rounded-[12px] border border-border bg-surface-2 p-3.5 text-[13px] leading-relaxed text-ink-2">
                Histórico e dados de proveniência também serão apagados. Essa ação não pode ser desfeita.
              </div>
            </div>
            <div className="flex gap-2.5 px-6 pb-6">
              <button
                onClick={doDelete}
                disabled={deleting}
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] bg-danger p-3.5 text-sm font-bold text-white disabled:opacity-60"
              >
                <Trash size={16} /> {deleting ? "Excluindo..." : "Sim, excluir"}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className="rounded-[14px] border border-border-2 bg-card px-5 py-3.5 text-sm font-semibold text-ink-2 disabled:opacity-60"
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
