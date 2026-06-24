"use client";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  WhatsappLogo,
  CheckCircle,
  Copy,
  DeviceMobile,
  Info,
  ShieldCheck,
  Storefront,
  Hamburger,
  Scissors,
  PawPrint,
  ForkKnife,
  Barbell,
  Tooth,
  Coffee,
  Sparkle,
  MapPin,
  Star,
  CaretDown,
  CaretUp,
  Lightning,
  ListBullets,
  SkipForward,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { fmtPhone } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import { promptFollowupSuggestion } from "@/lib/followup-prompt";

// ---- helpers ----

function LeadIcon({ category, size }: { category: string | null; size: number }) {
  const c = (category ?? "").toLowerCase();
  if (c.includes("hamburg")) return <Hamburger size={size} />;
  if (c.includes("barbear")) return <Scissors size={size} />;
  if (c.includes("pet")) return <PawPrint size={size} />;
  if (c.includes("restaur")) return <ForkKnife size={size} />;
  if (c.includes("academ")) return <Barbell size={size} />;
  if (c.includes("odont")) return <Tooth size={size} />;
  if (c.includes("cafe") || c.includes("café")) return <Coffee size={size} />;
  if (c.includes("estetic") || c.includes("estét")) return <Sparkle size={size} />;
  return <Storefront size={size} />;
}

const waLink = (phone: string | null, text: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  const num = d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
};

function buildMsg(l: Lead): string {
  // Envia SO a abertura (msg1). O pitch (msg2) e passo opcional, na ficha do lead.
  return l.draft_msg1 ?? "";
}

// ---- card component ----

interface CardProps {
  lead: Lead;
  onSent: (id: string) => void;
  repo: ReturnType<typeof useLeads>["repo"];
  refresh: () => Promise<void>;
  defaultExpanded?: boolean;
}

function LeadCard({ lead, onSent, repo, refresh, defaultExpanded = false }: CardProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [busy, setBusy] = useState(false);

  const msg = buildMsg(lead);
  const isAprovado = lead.status === "aprovado";

  const copyMsg = useCallback(async () => {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Não consegui copiar. Selecione o texto manualmente.");
    }
  }, [msg]);

  const handleSendClick = useCallback(async () => {
    setBusy(true);
    try {
      // copia a mensagem pro clipboard antes de abrir o WhatsApp
      if (msg) {
        try {
          await navigator.clipboard.writeText(msg);
        } catch {
          // ignora falha silenciosa de clipboard (nem todos os browsers deixam)
        }
      }
      // se ainda esta em rascunho_pronto, precisa aprovar antes de marcar enviado
      if (lead.status === "rascunho_pronto") {
        await repo.transition(lead.id, "aprovado", "human");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao preparar envio");
      setBusy(false);
      return;
    }
    setBusy(false);
  }, [lead, repo, msg]);

  const markSent = useCallback(async () => {
    setBusy(true);
    try {
      // garante que passou pelo aprovado (pode nao ter clicado no wa.me antes)
      if (lead.status === "rascunho_pronto") {
        await repo.transition(lead.id, "aprovado", "human");
      }
      await repo.transition(lead.id, "enviado", "human");
      await refresh();
      onSent(lead.id);
      toast.success("Marcado como enviado.");
      // #1 — oferece agendar o follow-up em 1 toque
      promptFollowupSuggestion({ lead, repo, onSaved: refresh });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar enviado");
    } finally {
      setBusy(false);
    }
  }, [lead, repo, refresh, onSent]);

  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
      {/* cabecalho do card */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-start gap-3 p-4 text-left"
      >
        <div className="flex size-11 flex-none items-center justify-center rounded-[13px] bg-brand-50 text-brand">
          <LeadIcon category={lead.category} size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-base font-bold">{lead.business_name}</div>
          <div className="flex items-center gap-2 text-[12.5px] text-muted-foreground">
            {lead.neighborhood && (
              <span className="flex items-center gap-1">
                <MapPin size={12} /> {lead.neighborhood}
              </span>
            )}
            {lead.rating && (
              <span className="flex items-center gap-1">
                <Star size={11} weight="fill" className="text-[#E8A93B]" /> {lead.rating}
              </span>
            )}
            <span className="text-faint">{fmtPhone(lead.phone)}</span>
          </div>
        </div>
        <div className="flex flex-none items-center gap-2">
          {isAprovado && (
            <span className="rounded-full bg-success-bg px-2 py-0.5 text-[10.5px] font-bold text-success">
              Aprovado
            </span>
          )}
          <span className="-mr-2 flex size-11 items-center justify-center text-muted-foreground">
            {expanded ? <CaretUp size={16} /> : <CaretDown size={16} />}
          </span>
        </div>
      </button>

      {/* conteudo expandido */}
      {expanded && (
        <div className="border-t border-border">
          {msg ? (
            <div className="p-4">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-faint">
                  Mensagem pronta
                </span>
                <button
                  onClick={copyMsg}
                  aria-label="Copiar mensagem"
                  className="-mr-2 flex min-h-[44px] items-center gap-1 rounded-lg px-3 py-2 text-[11.5px] font-semibold text-brand"
                >
                  <Copy size={13} /> Copiar
                </button>
              </div>
              <div className="rounded-[13px] border border-border bg-surface-2 p-3 text-[13px] leading-relaxed text-ink-2 whitespace-pre-wrap">
                {msg}
              </div>
            </div>
          ) : (
            <div className="p-4 text-[13px] text-muted-foreground">
              Sem mensagem gerada ainda.
            </div>
          )}

          {/* botoes de acao */}
          <div className="flex flex-col gap-2.5 px-4 pb-4">
            <a
              href={waLink(lead.whatsapp ?? lead.phone, msg)}
              target="_blank"
              rel="noreferrer"
              onClick={handleSendClick}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-[14px] p-4 text-sm font-bold text-white",
                busy && "pointer-events-none opacity-60",
              )}
              style={{ background: "var(--wa)" }}
            >
              <WhatsappLogo size={20} weight="fill" /> Abrir conversa no WhatsApp
            </a>
            <button
              onClick={markSent}
              disabled={busy}
              className="w-full rounded-[14px] border border-border-2 bg-card p-3.5 text-sm font-semibold text-ink-2 disabled:opacity-50"
            >
              {busy ? "Aguarde..." : "Já enviei, marcar como feito"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- pagina principal ----

export default function CelularPage() {
  const { leads, loading, error, repo, refresh } = useLeads();
  const [sentCount, setSentCount] = useState(0);
  // #7 — modo lote (fila continua): mostra um card por vez e avanca sozinho.
  const [mode, setMode] = useState<"lista" | "lote">("lista");
  const [deferred, setDeferred] = useState<string[]>([]);

  const queue = useMemo(
    () => leads.filter((l) => l.status === "rascunho_pronto" || l.status === "aprovado"),
    [leads],
  );

  // Fila do lote: os pulados vao pro fim, preservando a ordem do pulo.
  const orderedQueue = useMemo(() => {
    const def = new Set(deferred);
    const head = queue.filter((l) => !def.has(l.id));
    const tail = deferred
      .map((id) => queue.find((l) => l.id === id))
      .filter((l): l is Lead => Boolean(l));
    return [...head, ...tail];
  }, [queue, deferred]);

  const onSent = useCallback(() => {
    setSentCount((n) => n + 1);
  }, []);

  const skipLote = useCallback((id: string) => {
    setDeferred((d) => [...d.filter((x) => x !== id), id]);
  }, []);

  const current = orderedQueue[0];

  if (loading) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <div className="text-center text-sm text-muted-foreground">Carregando...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <div className="rounded-[16px] border border-danger bg-danger-bg p-4 text-sm text-danger">
          {error}
        </div>
      </div>
    );
  }

  // estado vazio
  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 pt-8">
        <div className="rounded-[22px] border border-border bg-card p-10 text-center shadow-[var(--shadow)]">
          <div className="mx-auto mb-4 flex size-16 items-center justify-center rounded-[18px] bg-success-bg text-success">
            <CheckCircle size={34} weight="fill" />
          </div>
          <div className="font-heading text-xl font-bold">
            {sentCount > 0
              ? `Você enviou ${sentCount}. Fila zerada.`
              : "Fila zerada, nada pra enviar agora."}
          </div>
          <p className="mt-2 text-[13.5px] text-muted-foreground">
            Quando a IA gerar novos rascunhos eles aparecem aqui. Pode fechar e voltar depois.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-10">
      {/* cabecalho da pagina */}
      <div className="mb-5 pt-2">
        <div className="flex items-center gap-2.5">
          <DeviceMobile size={20} className="text-brand" />
          <h1 className="font-heading text-lg font-bold">Enviar no celular</h1>
          <span className="rounded-full bg-brand-50 px-2.5 py-0.5 text-[11.5px] font-bold text-brand">
            {queue.length}
          </span>
          {/* #7 — alterna lista x lote */}
          <div className="ml-auto flex gap-1 rounded-full bg-[var(--inset)] p-1">
            <button
              type="button"
              onClick={() => setMode("lista")}
              aria-pressed={mode === "lista"}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                mode === "lista" ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground",
              )}
            >
              <ListBullets size={13} /> Lista
            </button>
            <button
              type="button"
              onClick={() => setMode("lote")}
              aria-pressed={mode === "lote"}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[12px] font-semibold transition-colors",
                mode === "lote" ? "bg-card text-foreground shadow-[var(--shadow)]" : "text-muted-foreground",
              )}
            >
              <Lightning size={13} weight="fill" /> Lote
            </button>
          </div>
        </div>

        {/* explicacao curta do fluxo mobile */}
        <div className="mt-3 flex gap-2.5 rounded-[14px] border border-border bg-surface-2 p-3.5">
          <Info size={16} className="mt-0.5 flex-none text-brand" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            No celular você abre cada conversa direto no WhatsApp e manda do seu número, no seu
            tempo. A injeção automática não roda aqui. Depois que enviar, marca o status no próprio
            card abaixo.
          </p>
        </div>
      </div>

      {/* modo lote: um card por vez, avanca sozinho ao enviar (#7) */}
      {mode === "lote" ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2 rounded-[14px] border border-border bg-surface-2 px-4 py-2.5">
            <span className="text-[12.5px] font-semibold text-ink-2">
              {sentCount > 0 ? `${sentCount} enviado${sentCount > 1 ? "s" : ""} · ` : ""}
              faltam {orderedQueue.length}
            </span>
            {current && (
              <button
                type="button"
                onClick={() => skipLote(current.id)}
                className="flex items-center gap-1 text-[12.5px] font-semibold text-muted-foreground hover:text-brand"
              >
                <SkipForward size={14} /> Pular
              </button>
            )}
          </div>
          {current && (
            <LeadCard
              key={current.id}
              lead={current}
              onSent={onSent}
              repo={repo}
              refresh={refresh}
              defaultExpanded
            />
          )}
        </div>
      ) : (
        /* lista de cards */
        <div className="flex flex-col gap-3">
          {queue.map((lead) => (
            <LeadCard
              key={lead.id}
              lead={lead}
              onSent={onSent}
              repo={repo}
              refresh={refresh}
            />
          ))}
        </div>
      )}

      {/* rodape de seguranca */}
      <div className="mt-6 flex items-center justify-center gap-2 text-[11.5px] text-faint">
        <ShieldCheck size={15} className="text-success" />
        Você manda do seu número, com a própria mão. O 4YU CRM nunca dispara sozinho.
      </div>
    </div>
  );
}
