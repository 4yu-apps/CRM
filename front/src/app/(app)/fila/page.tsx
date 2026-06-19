"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Check,
  CheckCircle,
  Info,
  MapPin,
  PencilSimple,
  ShieldCheck,
  Sparkle,
  Star,
  WhatsappLogo,
  X,
  Storefront,
  Hamburger,
  Scissors,
  PawPrint,
  ForkKnife,
  Barbell,
  Tooth,
  Coffee,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { SERVICE_META } from "@/lib/service";
import { fmtPhone, fmtCnpj } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";

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

function fichaRows(l: Lead) {
  return [
    { k: "Dono / responsável", v: l.owner_name ?? "-" },
    { k: "Telefone", v: fmtPhone(l.phone) },
    { k: "Instagram", v: l.instagram ?? "-" },
    { k: "CNPJ", v: l.cnpj ? fmtCnpj(l.cnpj) : "-" },
    { k: "Site", v: l.website ? "Tem" : "Não tem" },
    { k: "Já anuncia?", v: l.ads_active == null ? "Não sei" : l.ads_active ? "Sim" : "Ainda não" },
  ];
}

const waLink = (phone: string | null, text: string) => {
  const d = (phone ?? "").replace(/\D/g, "");
  const num = d.length >= 12 ? d : `55${d}`;
  return `https://wa.me/${num}?text=${encodeURIComponent(text)}`;
};

export default function FilaPage() {
  const { leads, repo, refresh } = useLeads();
  const queue = useMemo(() => leads.filter((l) => l.status === "rascunho_pronto"), [leads]);

  const [edits, setEdits] = useState<Record<string, { m1: string; m2: string }>>({});
  const [sendLead, setSendLead] = useState<Lead | null>(null);
  const [tally, setTally] = useState({ approved: 0, discarded: 0 });

  const cur = queue[0];
  const reviewed = tally.approved + tally.discarded;
  const total = reviewed + queue.length;

  const msgOf = (l: Lead) => edits[l.id] ?? { m1: l.draft_msg1 ?? "", m2: l.draft_msg2 ?? "" };
  const setM = (id: string, patch: Partial<{ m1: string; m2: string }>) =>
    setEdits((e) => ({ ...e, [id]: { ...msgOf(cur!), ...e[id], ...patch } }));

  const discard = useCallback(async () => {
    if (!cur) return;
    const target = cur;
    try {
      await repo.transition(target.id, "descartado", "human");
      setTally((t) => ({ ...t, discarded: t.discarded + 1 }));
      await refresh();
      toast.success("Descartado. Nao aparece mais pra voce.", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            await repo.transition(target.id, "enriquecido", "human");
            await refresh();
            toast.message("Voltou pra revisao.");
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao descartar");
    }
  }, [cur, repo, refresh]);

  const approve = useCallback(async () => {
    if (!cur) return;
    const m = edits[cur.id] ?? { m1: cur.draft_msg1 ?? "", m2: cur.draft_msg2 ?? "" };
    try {
      if (m.m1 !== (cur.draft_msg1 ?? "") || m.m2 !== (cur.draft_msg2 ?? "")) {
        await repo.update(cur.id, { draft_msg1: m.m1, draft_msg2: m.m2 });
      }
      const lead = await repo.transition(cur.id, "aprovado", "human");
      setSendLead({ ...lead, draft_msg1: m.m1, draft_msg2: m.m2 });
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aprovar");
    }
  }, [cur, repo, refresh, edits]);

  const markSent = useCallback(async () => {
    if (!sendLead) return;
    try {
      await repo.transition(sendLead.id, "enviado", "human");
      setTally((t) => ({ ...t, approved: t.approved + 1 }));
      setSendLead(null);
      await refresh();
      toast.success("Pronto. Marquei como enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar enviado");
    }
  }, [sendLead, repo, refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (sendLead) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      if (e.key === "a" || e.key === "A") void approve();
      if (e.key === "d" || e.key === "D") void discard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, discard, sendLead]);

  // fila vazia
  if (queue.length === 0) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <div className="fu mx-auto mt-16 max-w-[520px] rounded-[22px] border border-border bg-card p-14 text-center shadow-[var(--shadow)]">
          <div className="mx-auto mb-5 flex size-18 items-center justify-center rounded-[20px] bg-success-bg text-success">
            <CheckCircle size={38} weight="fill" />
          </div>
          <div className="font-heading text-2xl font-bold">Fila zerada, parabens.</div>
          <p className="mt-2 text-muted-foreground">
            Voce revisou tudo. Aprovou {tally.approved} e descartou {tally.discarded} agora. Vou continuar
            buscando e te aviso quando chegar gente nova.
          </p>
          <Link
            href="/buscar"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            Buscar mais agora <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  const service = SERVICE_META[cur.service_target];
  const msg = msgOf(cur);
  const pct = total ? Math.round((reviewed / total) * 100) : 0;

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5">
          <div className="text-sm text-muted-foreground">
            Revisando <strong className="text-foreground">{reviewed + 1} de {total}</strong>
          </div>
          <div className="h-1.5 w-[200px] overflow-hidden rounded-full bg-[var(--inset)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--grad)" }} />
          </div>
        </div>
        <div className="hidden items-center gap-2 text-[12.5px] text-faint sm:flex">
          <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">A</kbd>
          aprovar
          <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">D</kbd>
          descartar
        </div>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_420px]">
        {/* ficha card */}
        <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex items-start gap-4 border-b border-border p-6">
            <div className="flex size-13 flex-none items-center justify-center rounded-[14px] bg-brand-50 text-brand">
              <LeadIcon category={cur.category} size={26} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2.5">
                <div className="text-xl font-bold tracking-tight">{cur.business_name}</div>
                <span className="rounded-full bg-brand-50 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand">
                  {cur.category}
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider", service.badge)}>
                  {service.short}
                </span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-3.5 text-[13.5px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <MapPin size={15} /> {cur.neighborhood}, {cur.city}
                </span>
                <span className="flex items-center gap-1.5">
                  <Star size={14} weight="fill" className="text-[#E8A93B]" /> {cur.rating}{" "}
                  <span className="text-faint">({cur.reviews_count})</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4.5 p-6">
            {/* motivo */}
            <div className="rounded-[14px] border border-brand-100 bg-brand-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                <Sparkle size={15} weight="fill" /> Por que esse e um bom alvo
              </div>
              <div className="text-[14.5px] leading-relaxed text-ink-2">{cur.score_reason?.summary}</div>
            </div>

            {/* dados grid */}
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2">
              {fichaRows(cur).map((r) => (
                <div key={r.k} className="bg-card p-3.5">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{r.k}</div>
                  <div className="text-sm font-semibold">{r.v}</div>
                </div>
              ))}
            </div>

            {/* sinais */}
            <div>
              <div className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">Sinais que eu li</div>
              <div className="flex flex-col gap-2">
                {(cur.score_reason?.criteria ?? []).map((c, i) => (
                  <div key={i} className="flex items-center gap-2.5 text-[13.5px] text-ink-2">
                    <Check size={15} weight="bold" className="text-success" /> {c.note}
                  </div>
                ))}
              </div>
            </div>

            <Link href={`/ficha/${cur.id}`} className="flex items-center gap-1.5 text-[13.5px] font-bold text-brand">
              Ver ficha completa <ArrowRight size={15} />
            </Link>
          </div>
        </div>

        {/* mensagem + acoes */}
        <div className="flex flex-col gap-4 lg:sticky lg:top-0">
          <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
            <div className="flex items-center justify-between border-b border-border px-5 py-4">
              <div className="text-sm font-bold">Mensagem pronta</div>
              <span className="flex items-center gap-1.5 text-[11.5px] text-faint">
                <PencilSimple size={14} /> da pra editar
              </span>
            </div>
            <div className="flex flex-col gap-3 p-4">
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">1. Abertura</div>
                <textarea
                  value={msg.m1}
                  onChange={(e) => setM(cur.id, { m1: e.target.value })}
                  rows={4}
                  className="w-full resize-none rounded-xl border border-border-2 bg-surface-2 p-3.5 text-sm leading-relaxed outline-none focus:border-brand"
                />
              </div>
              <div>
                <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-faint">2. Pitch</div>
                <textarea
                  value={msg.m2}
                  onChange={(e) => setM(cur.id, { m2: e.target.value })}
                  rows={3}
                  className="w-full resize-none rounded-xl border border-border-2 bg-surface-2 p-3.5 text-sm leading-relaxed outline-none focus:border-brand"
                />
              </div>
              <div className="flex items-center gap-1.5 text-xs text-faint">
                <Info size={14} /> Quem envia e voce, no seu ritmo. Nada sai sozinho.
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              onClick={discard}
              className="flex w-[120px] flex-none items-center justify-center gap-2 rounded-[14px] border border-border-2 bg-card p-4 text-sm font-bold text-danger transition-colors hover:bg-danger-bg"
            >
              <X size={17} weight="bold" /> Descartar
            </button>
            <button
              onClick={approve}
              className="flex flex-1 items-center justify-center gap-2 rounded-[14px] p-4 text-sm font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5"
              style={{ background: "var(--grad)" }}
            >
              <Check size={18} weight="bold" /> Aprovar e preparar envio
            </button>
          </div>
        </div>
      </div>

      {/* modal de envio */}
      {sendLead && (
        <div
          onClick={() => setSendLead(null)}
          className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(20,12,40,.45)] p-6 backdrop-blur-[2px]"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-[480px] max-w-full overflow-hidden rounded-[22px] bg-card shadow-[var(--shadow-lg)]"
            style={{ animation: "fadeUp .25s both" }}
          >
            <div className="flex items-center gap-3 px-6 pt-6">
              <div className="flex size-11 flex-none items-center justify-center rounded-[13px] bg-success-bg text-success">
                <Check size={24} weight="bold" />
              </div>
              <div>
                <div className="text-lg font-bold">Aprovado. Bora enviar.</div>
                <div className="text-[13px] text-muted-foreground">
                  {sendLead.business_name} · {sendLead.neighborhood}
                </div>
              </div>
            </div>
            <div className="px-6 py-4">
              <div className="max-h-40 overflow-auto rounded-[14px] border border-border bg-surface-2 p-4 text-[13.5px] leading-relaxed text-ink-2">
                {[sendLead.draft_msg1, sendLead.draft_msg2].filter(Boolean).join("\n\n")}
              </div>
              <div className="mt-3 flex items-center gap-2 text-[12.5px] text-faint">
                <ShieldCheck size={16} className="text-success" /> Voce manda do seu numero, com a propria mao. O
                4YU nunca dispara sozinho.
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-6 pb-6">
              <a
                href={waLink(sendLead.phone, [sendLead.draft_msg1, sendLead.draft_msg2].filter(Boolean).join("\n\n"))}
                target="_blank"
                rel="noreferrer"
                onClick={markSent}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] p-4 text-sm font-bold text-white"
                style={{ background: "var(--wa)" }}
              >
                <WhatsappLogo size={20} weight="fill" /> Abrir conversa e enviar
              </a>
              <button
                onClick={markSent}
                className="w-full rounded-[14px] border border-border-2 bg-card p-3 text-sm font-semibold text-ink-2"
              >
                Ja mandei, marcar como enviado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
