"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandGrabbing, CalendarBlank, CurrencyDollar, X, DotsThreeVertical, CaretRight, Bell } from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { SERVICE_META } from "@/lib/service";
import { createCalendarEvent } from "@/lib/calendar";
import { canTransition } from "@/lib/state-machine";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus, DealBilling } from "@/lib/types";

function fmtBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

function getFollowupBadge(lead: Lead): "hoje" | "atrasado" | null {
  if (!lead.followup_at) return null;
  if (["fechado", "respondeu", "interessado", "reuniao", "proposta", "perdido", "sem_interesse", "descartado"].includes(lead.status)) return null;
  const due = new Date(lead.followup_at);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
  if (due >= todayStart && due <= todayEnd) return "hoje";
  if (due < todayStart) return "atrasado";
  return null;
}

// ---------------------------------------------------------------------------
// Mapa de colunas do kanban
// ---------------------------------------------------------------------------

interface KanbanColumn {
  id: string;
  label: string;
  color: string;
  // Status internos que pertencem a essa coluna
  statuses: LeadStatus[];
  // Status que será usado na transição ao soltar nessa coluna
  targetStatus: LeadStatus | null;
  // Coluna especial de arquivados
  isArchived?: boolean;
}

const KANBAN_COLUMNS: KanbanColumn[] = [
  {
    id: "novo",
    label: "Novo",
    color: "#7C3AED",
    statuses: ["rascunho_pronto", "aprovado"],
    targetStatus: "aprovado",
  },
  {
    id: "enviado",
    label: "Enviado",
    color: "#2A8FE0",
    statuses: ["enviado", "sem_resposta"],
    targetStatus: "enviado",
  },
  {
    id: "respondeu",
    label: "Respondeu",
    color: "#16A05A",
    statuses: ["respondeu"],
    targetStatus: "respondeu",
  },
  {
    id: "interessado",
    label: "Interessado",
    color: "#C9870F",
    statuses: ["interessado"],
    targetStatus: "interessado",
  },
  {
    id: "reuniao",
    label: "Reuniao",
    color: "#0891B2",
    statuses: ["reuniao", "proposta"],
    targetStatus: "reuniao",
  },
  {
    id: "fechou",
    label: "Fechou",
    color: "#15A05A",
    statuses: ["fechado"],
    targetStatus: "fechado",
  },
  {
    id: "arquivados",
    label: "Arquivados",
    color: "#94A3B8",
    statuses: [],
    targetStatus: null,
    isArchived: true,
  },
];

// Status que ficam na coluna arquivados (independente do archived flag)
const ARCHIVED_STATUSES: LeadStatus[] = ["descartado", "sem_interesse", "perdido"];

function getColumnForLead(lead: Lead): KanbanColumn | undefined {
  if (lead.archived || ARCHIVED_STATUSES.includes(lead.status)) {
    return KANBAN_COLUMNS.find((c) => c.isArchived);
  }
  return KANBAN_COLUMNS.find((c) => c.statuses.includes(lead.status));
}

// ---------------------------------------------------------------------------
// Modal: agendamento de reuniao
// ---------------------------------------------------------------------------

interface MeetingData {
  dateTime: string;
  link: string;
  location: string;
}

interface MeetingModalProps {
  lead: Lead;
  onConfirm: (data: MeetingData) => void;
  onClose: () => void;
}

function FunnelMeetingModal({ lead, onConfirm, onClose }: MeetingModalProps) {
  const [dateTime, setDateTime] = useState("");
  const [modality, setModality] = useState<"online" | "presencial">("online");
  const [link, setLink] = useState("");
  const [location, setLocation] = useState("");

  // Sugestoes rapidas de horario
  function quickDate(hoursFromNow: number): string {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + hoursFromNow);
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }

  const QUICK_OPTIONS = [
    { label: "Amanha 10h", hours: () => { const d = new Date(); d.setDate(d.getDate() + 1); d.setHours(10, 0, 0, 0); const p = (n: number) => String(n).padStart(2, "0"); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T10:00`; } },
    { label: "Em 2h", hours: () => quickDate(2) },
    { label: "Em 24h", hours: () => quickDate(24) },
    { label: "Em 48h", hours: () => quickDate(48) },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-6 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[420px] max-w-full overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
        style={{ animation: "fadeUp .25s both" }}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-sky-500/15 text-sky-600">
              <CalendarBlank size={20} weight="fill" />
            </div>
            <div>
              <div className="text-base font-bold">Marcar reuniao</div>
              <div className="text-[12.5px] text-muted-foreground">{lead.business_name}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="px-6 py-5">
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
            Data e hora da reuniao
          </label>
          {/* Sugestoes rapidas */}
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {QUICK_OPTIONS.map((opt) => {
              const val = opt.hours();
              const isSelected = dateTime === val;
              return (
                <button
                  key={opt.label}
                  type="button"
                  onClick={() => setDateTime(val)}
                  className={cn(
                    "rounded-full border px-3 py-1 text-[11.5px] font-semibold transition-colors",
                    isSelected
                      ? "border-brand bg-brand text-white"
                      : "border-border-2 bg-surface-2 text-ink-2 hover:border-brand/50 hover:bg-brand-50 hover:text-brand"
                  )}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
          />
          {dateTime && (
            <p className="mt-1.5 text-[11.5px] font-semibold text-brand">
              {new Date(dateTime).toLocaleString("pt-BR", { dateStyle: "full", timeStyle: "short" })}
            </p>
          )}

          <div className="mt-4 mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">
            Como vai ser
          </div>
          <div className="flex overflow-hidden rounded-xl border border-border-2">
            {(["online", "presencial"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setModality(m)}
                className={cn(
                  "flex-1 py-2.5 text-sm font-semibold capitalize transition-colors",
                  modality === m ? "text-white" : "bg-surface-2 text-muted-foreground hover:text-brand",
                )}
                style={modality === m ? { background: "var(--grad)" } : undefined}
              >
                {m}
              </button>
            ))}
          </div>

          {modality === "online" ? (
            <input
              type="url"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              placeholder="Link da reuniao (Meet, Zoom, Teams...) — opcional"
              className="mt-3 w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
            />
          ) : (
            <input
              type="text"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Endereco do encontro — opcional"
              className="mt-3 w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
            />
          )}

          <p className="mt-3 text-[12px] text-muted-foreground">
            Fica salvo no lead e aparece na Agenda. Com o Google Calendar conectado, o evento e
            criado automaticamente.
          </p>
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-[14px] border border-border-2 bg-card p-3.5 text-sm font-semibold text-ink-2"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!dateTime) {
                toast.warning("Escolha uma data e hora antes de confirmar.");
                return;
              }
              onConfirm({
                dateTime,
                link: modality === "online" ? link.trim() : "",
                location: modality === "presencial" ? location.trim() : "",
              });
            }}
            className="flex-1 rounded-[14px] p-3.5 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Confirmar reuniao
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Modal: fechar negocio
// ---------------------------------------------------------------------------

interface DealModalProps {
  lead: Lead;
  onConfirm: (value: number, billing: DealBilling, months?: number) => void;
  onClose: () => void;
}

function FunnelDealModal({ lead, onConfirm, onClose }: DealModalProps) {
  const [value, setValue] = useState(lead.suggested_value != null ? String(lead.suggested_value) : "");
  const [billing, setBilling] = useState<DealBilling>("mensal_fixo");
  const [months, setMonths] = useState("");

  const handle = () => {
    const num = parseFloat(value.replace(",", "."));
    if (!value || isNaN(num) || num <= 0) {
      toast.warning("Informe um valor valido.");
      return;
    }
    if (billing === "por_prazo") {
      const m = parseInt(months);
      if (!months || isNaN(m) || m <= 0) {
        toast.warning("Informe o numero de meses.");
        return;
      }
      onConfirm(num, billing, m);
    } else {
      onConfirm(num, billing);
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-6 backdrop-blur-[2px]"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-[440px] max-w-full overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
        style={{ animation: "fadeUp .25s both" }}
      >
        <div className="flex items-center justify-between border-b border-border px-6 py-5">
          <div className="flex items-center gap-3">
            <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-emerald-500/15 text-emerald-600">
              <CurrencyDollar size={20} weight="fill" />
            </div>
            <div>
              <div className="text-base font-bold">Registrar negocio fechado</div>
              <div className="text-[12.5px] text-muted-foreground">{lead.business_name}</div>
            </div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-4 px-6 py-5">
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Valor fechado (R$)
            </label>
            {lead.suggested_value != null && (
              <p className="mb-1.5 text-[12px] text-muted-foreground">
                IA sugeriu <strong className="text-foreground">{fmtBRL(lead.suggested_value)}</strong>
              </p>
            )}
            <input
              type="text"
              inputMode="decimal"
              placeholder={lead.suggested_value != null ? String(lead.suggested_value) : "Ex: 1500"}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
              Tipo de cobranca
            </label>
            <div className="flex gap-2">
              {(["mensal_fixo", "por_prazo"] as DealBilling[]).map((opt) => (
                <button
                  key={opt}
                  onClick={() => setBilling(opt)}
                  className={cn(
                    "flex-1 rounded-xl border px-3.5 py-3 text-sm font-semibold transition-colors",
                    billing === opt
                      ? "border-brand bg-brand-50 text-brand"
                      : "border-border-2 bg-surface-2 text-ink-2 hover:border-brand/50"
                  )}
                >
                  {opt === "mensal_fixo" ? "Mensal fixo" : "Por prazo"}
                </button>
              ))}
            </div>
          </div>
          {billing === "por_prazo" && (
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-wider text-faint">
                Meses de contrato
              </label>
              <input
                type="number"
                min={1}
                placeholder="Ex: 3"
                value={months}
                onChange={(e) => setMonths(e.target.value)}
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
              />
            </div>
          )}
        </div>
        <div className="flex gap-3 px-6 pb-6">
          <button
            onClick={onClose}
            className="flex-1 rounded-[14px] border border-border-2 bg-card p-3.5 text-sm font-semibold text-ink-2"
          >
            Cancelar
          </button>
          <button
            onClick={handle}
            className="flex-1 rounded-[14px] p-3.5 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Salvar e fechar
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Card individual do kanban
// ---------------------------------------------------------------------------

interface FunnelCardProps {
  lead: Lead;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, lead: Lead) => void;
  onMove: (lead: Lead) => void;
}

function FunnelCard({ lead, onDragStart, onMove }: FunnelCardProps) {
  const router = useRouter();
  const service = SERVICE_META[lead.service_target] ?? SERVICE_META.indefinido;
  const followupBadge = getFollowupBadge(lead);

  return (
    <div
      draggable
      onDragStart={(e) => onDragStart(e, lead)}
      onClick={() => router.push(`/ficha/${lead.id}`)}
      className={cn(
        "cursor-grab rounded-[12px] border border-border bg-card p-3.5 shadow-[0_1px_4px_rgba(0,0,0,.06)]",
        "active:cursor-grabbing hover:border-brand/30 hover:shadow-[0_3px_10px_rgba(0,0,0,.09)]",
        "transition-all duration-150 select-none"
      )}
    >
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="mb-0.5 truncate text-[13.5px] font-bold leading-snug text-ink">
            {lead.business_name ?? "Sem nome"}
          </div>
          <div className="text-[11.5px] text-faint">
            {lead.category ?? "Sem categoria"}
            {lead.neighborhood ? ` · ${lead.neighborhood}` : ""}
          </div>
        </div>
        {/* Mover: funciona no toque (no celular o arrastar nao rola). */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onMove(lead);
          }}
          aria-label="Mover este lead pra outro estagio"
          title="Mover"
          className="-mr-1 -mt-1 flex-none rounded-md p-1 text-faint transition-colors hover:bg-surface-2 hover:text-brand"
        >
          <DotsThreeVertical size={18} weight="bold" />
        </button>
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider",
            service.badge
          )}
        >
          {service.short}
        </span>
        {lead.status === "fechado" && lead.deal_value != null && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10.5px] font-bold text-emerald-700 dark:text-emerald-400">
            <CurrencyDollar size={11} weight="bold" />
            {fmtBRL(lead.deal_value)}
          </span>
        )}
        {followupBadge === "hoje" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10.5px] font-bold text-amber-700 dark:text-amber-300">
            <Bell size={11} weight="fill" />
            Follow-up hoje
          </span>
        )}
        {followupBadge === "atrasado" && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-rose-500/15 px-2 py-0.5 text-[10.5px] font-bold text-rose-700 dark:text-rose-400">
            <Bell size={11} weight="fill" />
            Follow-up atrasado
          </span>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Coluna do kanban
// ---------------------------------------------------------------------------

interface FunnelColumnProps {
  col: KanbanColumn;
  leads: Lead[];
  isDragOver: boolean;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragStart: (e: React.DragEvent<HTMLDivElement>, lead: Lead) => void;
  onMove: (lead: Lead) => void;
}

function FunnelColumn({
  col,
  leads,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
  onMove,
}: FunnelColumnProps) {
  return (
    <div
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={cn(
        "rounded-[16px] border p-3 transition-colors duration-150",
        isDragOver
          ? "border-brand/50 bg-brand-50/60"
          : "border-border bg-surface-2"
      )}
    >
      {/* Cabecalho da coluna */}
      <div className="mb-3 flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <span
            className="size-2.5 rounded-full"
            style={{ background: col.color }}
          />
          <span className="text-[13px] font-bold text-ink">{col.label}</span>
        </div>
        <span className="text-[12px] font-bold text-faint">{leads.length}</span>
      </div>

      {/* Cards */}
      <div className="flex flex-col gap-2 min-h-[46px]">
        {leads.map((lead) => (
          <FunnelCard key={lead.id} lead={lead} onDragStart={onDragStart} onMove={onMove} />
        ))}
        {leads.length === 0 && (
          <div
            className={cn(
              "rounded-[10px] border-[1.5px] border-dashed px-2 py-4 text-center text-[11.5px] text-faint transition-colors",
              isDragOver ? "border-brand/40 text-brand/60" : "border-border-2"
            )}
          >
            Solte aqui
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Sheet "mover" (toque): lista os estagios validos. Essencial no mobile, onde o
// arrastar (HTML5 drag) nao funciona.
// ---------------------------------------------------------------------------
function MoveSheet({
  lead,
  targets,
  onPick,
  onClose,
}: {
  lead: Lead;
  targets: KanbanColumn[];
  onPick: (col: KanbanColumn) => void;
  onClose: () => void;
}) {
  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-end justify-center bg-[rgba(20,12,40,.45)] backdrop-blur-[2px] sm:items-center sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[420px] overflow-hidden rounded-t-[22px] bg-card shadow-[var(--shadow-lg)] sm:rounded-[22px]"
        style={{ animation: "fadeUp .2s both" }}
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div className="min-w-0">
            <div className="text-[12px] text-muted-foreground">Mover pra</div>
            <div className="truncate text-[15px] font-bold">{lead.business_name ?? "Lead"}</div>
          </div>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X size={18} />
          </button>
        </div>
        <div className="flex flex-col gap-1.5 p-3">
          {targets.length === 0 && (
            <div className="px-3 py-4 text-center text-[13px] text-faint">
              Nenhum estagio disponivel a partir daqui.
            </div>
          )}
          {targets.map((col) => (
            <button
              key={col.id}
              onClick={() => onPick(col)}
              className="flex items-center justify-between rounded-[12px] border border-border-2 bg-surface-2 px-4 py-3 text-left text-sm font-semibold text-ink transition-colors hover:border-brand/50 hover:bg-brand-50"
            >
              <span className="flex items-center gap-2.5">
                <span className="size-2.5 rounded-full" style={{ background: col.color }} />
                {col.label}
              </span>
              <CaretRight size={16} className="text-faint" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

type ModalState =
  | { type: "none" }
  | { type: "meeting"; lead: Lead; targetColId: string }
  | { type: "deal"; lead: Lead; targetColId: string };

export default function FunilPage() {
  const { leads, repo, refresh } = useLeads();
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "none" });
  // Lead com o menu "mover" aberto (toque, pro mobile onde o arrastar nao rola).
  const [moveLead, setMoveLead] = useState<Lead | null>(null);

  // Snapshot local dos leads para revert visual instantaneo. Sincroniza com o
  // repo durante o render (padrao "derived state"), sem effect, pra o lint de
  // set-state-in-effect ficar feliz.
  const [localLeads, setLocalLeads] = useState<Lead[]>(leads);
  const [syncedFrom, setSyncedFrom] = useState(leads);
  if (syncedFrom !== leads) {
    setSyncedFrom(leads);
    setLocalLeads(leads);
  }

  // Agrupar leads por coluna
  const colLeads = useMemo(() => {
    const map: Record<string, Lead[]> = {};
    for (const col of KANBAN_COLUMNS) map[col.id] = [];
    for (const lead of localLeads) {
      const col = getColumnForLead(lead);
      if (col) map[col.id].push(lead);
      // leads em status interno (bruto/enriquecido/qualificado) nao aparecem no kanban
    }
    return map;
  }, [localLeads]);

  // -------------------------------------------------------------------------
  // Drag handlers
  // -------------------------------------------------------------------------

  // Auto-scroll do board enquanto arrasta perto da borda (estilo Trello): da pra
  // levar um card pra uma coluna que esta fora da tela. dirRef = -1..1 (esq/dir),
  // atualizado pelo onDragOver; o loop roda so durante o arraste (dragLeadId).
  const boardRef = useRef<HTMLDivElement>(null);
  const dirRef = useRef(0);

  useEffect(() => {
    if (!dragLeadId) return;
    let raf = requestAnimationFrame(function tick() {
      const el = boardRef.current;
      if (el && dirRef.current !== 0) el.scrollLeft += dirRef.current * 22;
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [dragLeadId]);

  // Le a posicao do ponteiro sobre o board e decide se rola pra esquerda/direita.
  const handleBoardDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    const el = boardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const EDGE = 90; // zona quente perto de cada borda
    const x = e.clientX;
    if (x < rect.left + EDGE) dirRef.current = -Math.min(1, (rect.left + EDGE - x) / EDGE);
    else if (x > rect.right - EDGE) dirRef.current = Math.min(1, (x - (rect.right - EDGE)) / EDGE);
    else dirRef.current = 0;
  }, []);

  const handleDragStart = useCallback(
    (e: React.DragEvent<HTMLDivElement>, lead: Lead) => {
      setDragLeadId(lead.id);
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", lead.id);
    },
    []
  );

  const handleDragEnd = useCallback(() => {
    setDragLeadId(null);
    setDragOverColId(null);
    dirRef.current = 0;
  }, []);

  const handleDragOver = useCallback(
    (e: React.DragEvent<HTMLDivElement>, colId: string) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      setDragOverColId(colId);
    },
    []
  );

  const handleDragLeave = useCallback(() => {
    setDragOverColId(null);
  }, []);

  // Executar transicao efetiva (apos confirmar modais se necessario)
  const executeTransition = useCallback(
    async (lead: Lead, col: KanbanColumn, note?: string) => {
      if (col.isArchived) {
        // Soltar em Arquivados
        const wasFromArchived = getColumnForLead(lead)?.isArchived;
        if (!wasFromArchived) {
          try {
            await repo.setArchived(lead.id, true);
            await refresh();
            toast.success("Lead arquivado.");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
          }
        }
        return;
      }

      // Soltar em coluna normal
      const fromArchived = getColumnForLead(lead)?.isArchived;

      if (fromArchived) {
        // Arrastar pra fora de arquivados: volta pra Novo (rascunho_pronto),
        // VISIVEL no kanban. Antes ia pra 'enriquecido' (status interno) e o
        // card sumia da tela.
        try {
          await repo.setArchived(lead.id, false);
          if (ARCHIVED_STATUSES.includes(lead.status)) {
            await repo.transition(lead.id, "rascunho_pronto", "human");
          }
          await refresh();
          toast.success("Lead reativado, voltou pra Novo.");
        } catch (e) {
          await refresh(); // nunca deixa o card sumir: ressincroniza com o real
          toast.error(e instanceof Error ? e.message : "Erro ao reativar lead");
        }
        return;
      }

      if (!col.targetStatus) return;

      try {
        await repo.transition(lead.id, col.targetStatus, "human", note);
        await refresh();
      } catch (e) {
        // Transicao invalida: reverter visual e avisar
        setLocalLeads((prev) => [...prev]); // forca re-render com estado anterior
        await refresh(); // sincroniza com estado real
        const msg = e instanceof Error ? e.message : "Erro ao mover lead";
        toast.error(
          msg.toLowerCase().includes("invalid") || msg.toLowerCase().includes("invalida")
            ? "Esse passo nao e valido a partir do estagio atual."
            : msg
        );
      }
    },
    [repo, refresh]
  );

  // Pedido de movimento (vindo do drag OU do menu "mover" por toque). Reuniao e
  // Fechou abrem modal; o resto transiciona direto.
  const requestMove = useCallback(
    (lead: Lead, col: KanbanColumn) => {
      const currentCol = getColumnForLead(lead);
      if (currentCol?.id === col.id) return;
      if (col.id === "reuniao") {
        setModal({ type: "meeting", lead, targetColId: col.id });
        return;
      }
      if (col.id === "fechou") {
        setModal({ type: "deal", lead, targetColId: col.id });
        return;
      }
      void executeTransition(lead, col);
    },
    [executeTransition],
  );

  // Colunas validas pra onde ESTE lead pode ir (alimenta o menu mover).
  const validTargets = useCallback((lead: Lead): KanbanColumn[] => {
    const cur = getColumnForLead(lead);
    return KANBAN_COLUMNS.filter((col) => {
      if (cur?.id === col.id) return false;
      if (cur?.isArchived) return col.id === "novo"; // arquivado: so reativar pra Novo
      if (col.isArchived) return true; // sempre da pra arquivar
      return col.targetStatus
        ? canTransition(lead.status, col.targetStatus, lead.opt_out ?? false)
        : false;
    });
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, col: KanbanColumn) => {
      e.preventDefault();
      setDragOverColId(null);
      const leadId = dragLeadId ?? e.dataTransfer.getData("text/plain");
      if (!leadId) return;
      const lead = localLeads.find((l) => l.id === leadId);
      if (!lead) return;
      requestMove(lead, col);
      setDragLeadId(null);
    },
    [dragLeadId, localLeads, requestMove]
  );

  // -------------------------------------------------------------------------
  // Confirmacoes dos modais
  // -------------------------------------------------------------------------

  const handleMeetingConfirm = useCallback(
    async (data: MeetingData) => {
      if (modal.type !== "meeting") return;
      const { lead } = modal;
      const col = KANBAN_COLUMNS.find((c) => c.id === "reuniao")!;
      const iso = new Date(data.dateTime).toISOString();
      const quando = new Date(data.dateTime).toLocaleString("pt-BR");
      const note = data.link
        ? `Reuniao online · ${quando}`
        : data.location
          ? `Reuniao presencial (${data.location}) · ${quando}`
          : `Reuniao · ${quando}`;
      setModal({ type: "none" });

      // 1) Salva os campos de reuniao no lead (Agenda e sininho leem daqui).
      // Best-effort: nao bloqueia a transicao.
      try {
        await repo.update(lead.id, {
          meeting_at: iso,
          meeting_link: data.link || null,
          meeting_location: data.location || null,
        });
      } catch {
        // segue mesmo assim; a transicao + nota garantem o registro
      }

      // 2) Transicao + nota: o que o funil ja fazia. E o caminho principal e
      // nunca e bloqueado pelo calendar.
      await executeTransition(lead, col, note);

      // 3) Best-effort: criar o evento no Google Calendar. Qualquer falha aqui
      // (sem token, token expirado, rede) so vira um aviso amigavel; jamais
      // desfaz a transicao nem joga erro vermelho.
      const service = SERVICE_META[lead.service_target] ?? SERVICE_META.indefinido;
      const result = await createCalendarEvent(
        {
          business_name: lead.business_name,
          phone: lead.phone,
          service_label: service.label,
          location: data.location || data.link || null,
        },
        iso
      );

      if (result.ok) {
        // Salva o ID do evento para poder cancelar depois se necessario.
        try {
          await repo.update(lead.id, { meeting_gcal_event_id: result.eventId });
        } catch {
          // best-effort: nao bloqueia
        }
        toast.success("Evento criado no seu Google Calendar.");
      } else if (result.reason === "token_expirado") {
        toast.message(
          "Sua conexao com o Google expirou. Entre de novo com o Google na Configuracao pra criar o evento automaticamente."
        );
      } else if (result.reason === "sem_token") {
        toast.message(
          "Reuniao salva na Agenda. Conecte o Google Calendar na Configuracao pra criar o evento automaticamente."
        );
      } else {
        toast.message(
          "Reuniao salva na Agenda. Nao consegui criar o evento no Google Calendar agora; tente de novo mais tarde."
        );
      }
    },
    [modal, repo, executeTransition]
  );

  const handleDealConfirm = useCallback(
    async (value: number, billing: DealBilling, months?: number) => {
      if (modal.type !== "deal") return;
      const { lead } = modal;
      const col = KANBAN_COLUMNS.find((c) => c.id === "fechou")!;
      setModal({ type: "none" });

      try {
        // Salvar campos do deal
        const patch: Parameters<typeof repo.update>[1] = {
          deal_value: value,
          deal_billing: billing,
          deal_closed_at: new Date().toISOString(),
          ...(months ? { deal_term_months: months } : {}),
        };
        await repo.update(lead.id, patch);
        // Transicao para fechado
        await executeTransition(lead, col);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Erro ao salvar negocio");
      }
    },
    [modal, repo, executeTransition]
  );

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  // Resumo de fechados para exibir no topo do funil
  const fechadosSummary = useMemo(() => {
    const fechados = localLeads.filter((l) => l.status === "fechado");
    const receita = fechados.reduce((s, l) => s + (l.deal_value ?? 0), 0);
    return { count: fechados.length, receita };
  }, [localLeads]);

  return (
    <div
      className="mx-auto w-full max-w-[1760px]"
      onDragEnd={handleDragEnd}
    >
      {/* Instrucao + resumo de receita */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <HandGrabbing size={17} className="text-brand" />
          Arraste o card, ou toque nos 3 pontinhos pra mover. No celular, deslize as colunas de lado.
        </div>
        {fechadosSummary.count > 0 && (
          <div className="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1.5 text-[12.5px] font-semibold text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-400">
            <CurrencyDollar size={14} weight="bold" />
            {fechadosSummary.receita > 0
              ? `${fmtBRL(fechadosSummary.receita)} · ${fechadosSummary.count} ${fechadosSummary.count === 1 ? "contrato fechado" : "contratos fechados"}`
              : `${fechadosSummary.count} ${fechadosSummary.count === 1 ? "contrato fechado" : "contratos fechados"}`}
          </div>
        )}
      </div>

      {/* Colunas estilo Trello: largura fixa e scroll horizontal em qualquer
          tamanho. As colunas da direita (arquivados etc.) ficam fora da tela e
          aparecem ao rolar de lado — sem apertar os cards. */}
      <div
        ref={boardRef}
        onDragOver={handleBoardDragOver}
        className="kanban-scroll flex snap-x snap-mandatory gap-3.5 overflow-x-auto pb-3 lg:snap-none"
      >
        {KANBAN_COLUMNS.map((col) => (
          <div
            key={col.id}
            className="w-[82vw] shrink-0 snap-start sm:w-[300px]"
          >
            <FunnelColumn
              col={col}
              leads={colLeads[col.id] ?? []}
              isDragOver={dragOverColId === col.id}
              onDragOver={(e) => handleDragOver(e, col.id)}
              onDragLeave={handleDragLeave}
              onDrop={(e) => void handleDrop(e, col)}
              onDragStart={handleDragStart}
              onMove={setMoveLead}
            />
          </div>
        ))}
      </div>

      {/* Modal de reuniao */}
      {modal.type === "meeting" && (
        <FunnelMeetingModal
          lead={modal.lead}
          onConfirm={handleMeetingConfirm}
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Modal de deal */}
      {modal.type === "deal" && (
        <FunnelDealModal
          lead={modal.lead}
          onConfirm={handleDealConfirm}
          onClose={() => setModal({ type: "none" })}
        />
      )}

      {/* Sheet mover (toque, essencial no mobile) */}
      {moveLead && (
        <MoveSheet
          lead={moveLead}
          targets={validTargets(moveLead)}
          onPick={(col) => {
            const l = moveLead;
            setMoveLead(null);
            requestMove(l, col);
          }}
          onClose={() => setMoveLead(null)}
        />
      )}
    </div>
  );
}
