"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { HandGrabbing, CalendarBlank, CurrencyDollar, X } from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { SERVICE_META } from "@/lib/service";
import { createCalendarEvent } from "@/lib/calendar";
import { cn } from "@/lib/utils";
import type { Lead, LeadStatus, DealBilling } from "@/lib/types";

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

interface MeetingModalProps {
  lead: Lead;
  onConfirm: (dateTime: string) => void;
  onClose: () => void;
}

function FunnelMeetingModal({ lead, onConfirm, onClose }: MeetingModalProps) {
  const [dateTime, setDateTime] = useState("");

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
          <input
            type="datetime-local"
            value={dateTime}
            onChange={(e) => setDateTime(e.target.value)}
            className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-3 text-sm outline-none focus:border-brand"
          />
          <p className="mt-3 text-[12px] text-muted-foreground">
            A data fica salva na nota do lead. Quando a agenda do Google Calendar estiver conectada,
            o evento sera criado automaticamente.
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
              onConfirm(dateTime);
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
  const [value, setValue] = useState("");
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
            <input
              type="text"
              inputMode="decimal"
              placeholder="Ex: 1500"
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
}

function FunnelCard({ lead, onDragStart }: FunnelCardProps) {
  const router = useRouter();
  const service = SERVICE_META[lead.service_target] ?? SERVICE_META.indefinido;

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
      </div>
      <div className="mt-2.5">
        <span
          className={cn(
            "inline-flex items-center rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wider",
            service.badge
          )}
        >
          {service.short}
        </span>
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
}

function FunnelColumn({
  col,
  leads,
  isDragOver,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragStart,
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
          <FunnelCard key={lead.id} lead={lead} onDragStart={onDragStart} />
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

type ModalState =
  | { type: "none" }
  | { type: "meeting"; lead: Lead; targetColId: string }
  | { type: "deal"; lead: Lead; targetColId: string };

export default function FunilPage() {
  const { leads, repo, refresh } = useLeads();
  const [dragLeadId, setDragLeadId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ type: "none" });

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

  const handleDrop = useCallback(
    async (e: React.DragEvent<HTMLDivElement>, col: KanbanColumn) => {
      e.preventDefault();
      setDragOverColId(null);

      const leadId = dragLeadId ?? e.dataTransfer.getData("text/plain");
      if (!leadId) return;

      const lead = localLeads.find((l) => l.id === leadId);
      if (!lead) return;

      // Ja esta na coluna correta, nada a fazer
      const currentCol = getColumnForLead(lead);
      if (currentCol?.id === col.id) return;

      // Coluna Reuniao: abrir modal de data/hora
      if (col.id === "reuniao") {
        setModal({ type: "meeting", lead, targetColId: col.id });
        return;
      }

      // Coluna Fechou: abrir modal de deal
      if (col.id === "fechou") {
        setModal({ type: "deal", lead, targetColId: col.id });
        return;
      }

      await executeTransition(lead, col);
      setDragLeadId(null);
    },
    [dragLeadId, localLeads, executeTransition]
  );

  // -------------------------------------------------------------------------
  // Confirmacoes dos modais
  // -------------------------------------------------------------------------

  const handleMeetingConfirm = useCallback(
    async (dateTime: string) => {
      if (modal.type !== "meeting") return;
      const { lead } = modal;
      const col = KANBAN_COLUMNS.find((c) => c.id === "reuniao")!;
      const note = `Reuniao agendada para ${new Date(dateTime).toLocaleString("pt-BR")}`;
      setModal({ type: "none" });

      // 1) Transicao + nota: o que o funil ja fazia. E o caminho principal e
      // nunca e bloqueado pelo calendar.
      await executeTransition(lead, col, note);

      // 2) Best-effort: criar o evento no Google Calendar. Qualquer falha aqui
      // (sem token, token expirado, rede) so vira um aviso amigavel; jamais
      // desfaz a transicao nem joga erro vermelho.
      const service = SERVICE_META[lead.service_target] ?? SERVICE_META.indefinido;
      const result = await createCalendarEvent(
        {
          business_name: lead.business_name,
          phone: lead.phone,
          service_label: service.label,
        },
        new Date(dateTime).toISOString()
      );

      if (result.ok) {
        toast.success("Evento criado no seu Google Calendar.");
      } else if (result.reason === "token_expirado") {
        toast.message(
          "Sua conexao com o Google expirou. Entre de novo com o Google na Configuracao pra criar o evento automaticamente."
        );
      } else if (result.reason === "sem_token") {
        toast.message(
          "Reuniao salva na nota. Conecte o Google Calendar na Configuracao pra criar o evento automaticamente."
        );
      } else {
        toast.message(
          "Reuniao salva na nota. Nao consegui criar o evento no Google Calendar agora; tente de novo mais tarde."
        );
      }
    },
    [modal, executeTransition]
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

  return (
    <div
      className="mx-auto max-w-[1240px]"
      onDragEnd={handleDragEnd}
    >
      {/* Instrucao */}
      <div className="mb-4 flex items-center gap-2 text-sm text-muted-foreground">
        <HandGrabbing size={17} className="text-brand" />
        Arraste o card pra outra coluna pra mudar o estagio. Simples assim.
      </div>

      {/* Grid de colunas */}
      <div
        className="grid gap-3.5"
        style={{ gridTemplateColumns: `repeat(${KANBAN_COLUMNS.length}, minmax(0, 1fr))` }}
      >
        {KANBAN_COLUMNS.map((col) => (
          <FunnelColumn
            key={col.id}
            col={col}
            leads={colLeads[col.id] ?? []}
            isDragOver={dragOverColId === col.id}
            onDragOver={(e) => handleDragOver(e, col.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => void handleDrop(e, col)}
            onDragStart={handleDragStart}
          />
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
    </div>
  );
}
