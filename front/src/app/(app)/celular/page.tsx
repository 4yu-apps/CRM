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
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { fmtPhone } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";

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
  return [l.draft_msg1, l.draft_msg2].filter(Boolean).join("\n\n");
}

// ---- card component ----

interface CardProps {
  lead: Lead;
  onSent: (id: string) => void;
  repo: ReturnType<typeof useLeads>["repo"];
  refresh: () => Promise<void>;
}

function LeadCard({ lead, onSent, repo, refresh }: CardProps) {
  const [expanded, setExpanded] = useState(false);
  const [busy, setBusy] = useState(false);

  const msg = buildMsg(lead);
  const isAprovado = lead.status === "aprovado";

  const copyMsg = useCallback(async () => {
    if (!msg) return;
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("Mensagem copiada.");
    } catch {
      toast.error("Nao consegui copiar. Selecione o texto manualmente.");
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
          {expanded ? (
            <CaretUp size={16} className="text-muted-foreground" />
          ) : (
            <CaretDown size={16} className="text-muted-foreground" />
          )}
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
                  className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11.5px] font-semibold text-brand"
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
              {busy ? "Aguarde..." : "Ja enviei, marcar como feito"}
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

  const queue = useMemo(
    () => leads.filter((l) => l.status === "rascunho_pronto" || l.status === "aprovado"),
    [leads],
  );

  const onSent = useCallback(() => {
    setSentCount((n) => n + 1);
  }, []);

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
              ? `Voce enviou ${sentCount}. Fila zerada.`
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
        </div>

        {/* explicacao curta do fluxo mobile */}
        <div className="mt-3 flex gap-2.5 rounded-[14px] border border-border bg-surface-2 p-3.5">
          <Info size={16} className="mt-0.5 flex-none text-brand" />
          <p className="text-[12.5px] leading-relaxed text-ink-2">
            No celular voce abre cada conversa direto no WhatsApp e manda do seu numero, no seu
            tempo. A injecao automatica nao roda aqui. Depois que enviar, marca o status no proprio
            card abaixo.
          </p>
        </div>
      </div>

      {/* lista de cards */}
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

      {/* rodape de seguranca */}
      <div className="mt-6 flex items-center justify-center gap-2 text-[11.5px] text-faint">
        <ShieldCheck size={15} className="text-success" />
        Voce manda do seu numero, com a propria mao. O 4YU nunca dispara sozinho.
      </div>
    </div>
  );
}
