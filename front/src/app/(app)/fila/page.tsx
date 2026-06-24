"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Archive,
  Check,
  CheckCircle,
  SkipForward,
  MagnifyingGlass,
  Globe,
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
  GoogleLogo,
  MapTrifold,
  Megaphone,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { SERVICE_META } from "@/lib/service";
import { fmtPhone, fmtCnpj } from "@/lib/format";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import { Dropdown } from "@/components/dropdown";
import { openWhatsApp } from "@/lib/whatsapp";
import { googleSearchUrl, googleMapsUrl, metaAdsUrl } from "@/lib/links";
import { siteSignalChips, signalChipClass } from "@/lib/site-signals";
import { Skeleton } from "@/components/skeleton";

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

// Normaliza o site pra um link clicavel (https na frente quando falta).
function siteHref(site?: string | null): string | undefined {
  const s = (site ?? "").trim();
  if (!s) return undefined;
  return /^https?:\/\//i.test(s) ? s : `https://${s}`;
}

// Ordem pensada pra decisao de gestor de trafego: o que define o match vem
// primeiro (ja anuncia = angulo; site = destino; contato = consigo falar;
// instagram = canal atual). Dono e CNPJ ficam por ultimo (pouco decisivos).
function fichaRows(l: Lead): { k: string; v: string; href?: string }[] {
  return [
    { k: "Já anuncia?", v: l.ads_active == null ? "Não sei (confira ao lado)" : l.ads_active ? "Sim, já anuncia" : "Ainda não" },
    { k: "Site", v: l.website ? "Abrir site" : "Não tem", href: siteHref(l.website) },
    { k: "Telefone", v: fmtPhone(l.phone) },
    { k: "Instagram", v: l.instagram ?? "-" },
    { k: "Dono / responsável", v: l.owner_name ?? "-" },
    { k: "CNPJ", v: l.cnpj ? fmtCnpj(l.cnpj) : "-" },
  ];
}

// Chip-link pra conferir o negocio em fontes externas (Google, Maps, Meta Ads).
function ExternalChip({
  href,
  icon,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 rounded-full border border-border-2 bg-surface-2 px-2.5 py-1 text-[11.5px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
    >
      {icon}
      {children}
    </a>
  );
}


// Ordenacao da fila: comecar pelos melhores em vez de ordem aleatoria. Com 800+
// leads, isso e o que faz a revisao render.
type SortKey = "recomendados" | "valor" | "avaliacao" | "avaliacoes" | "completo";

const SORT_OPTIONS = [
  { value: "recomendados", label: "Recomendados", hint: "(melhor encaixe)" },
  { value: "valor", label: "Maior valor sugerido" },
  { value: "avaliacao", label: "Melhor avaliação" },
  { value: "avaliacoes", label: "Mais avaliações" },
  { value: "completo", label: "Ficha mais completa" },
];

// Quao "completa" esta a ficha: mais dados = mais facil de abordar com seguranca.
function completeness(l: Lead): number {
  let n = 0;
  if (l.phone) n++;
  if (l.instagram) n++;
  if (l.website) n++;
  if (l.cnpj) n++;
  if (l.owner_name) n++;
  if (l.email) n++;
  if (l.ads_active != null) n++;
  if (l.score_reason?.summary) n++;
  return n;
}

function sortQueue(leads: Lead[], key: SortKey): Lead[] {
  const arr = [...leads];
  const porReviews = (a: Lead, b: Lead) => (b.reviews_count ?? 0) - (a.reviews_count ?? 0);
  switch (key) {
    case "valor":
      return arr.sort(
        (a, b) => (b.suggested_value ?? -1) - (a.suggested_value ?? -1) || porReviews(a, b),
      );
    case "avaliacao":
      return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0) || porReviews(a, b));
    case "avaliacoes":
      return arr.sort(porReviews);
    case "completo":
      return arr.sort((a, b) => completeness(b) - completeness(a) || (b.score ?? 0) - (a.score ?? 0));
    case "recomendados":
    default:
      return arr.sort((a, b) => (b.score ?? 0) - (a.score ?? 0) || porReviews(a, b));
  }
}

export default function FilaPage() {
  const { leads, loading, repo, refresh } = useLeads();

  const [sortBy, setSortBy] = useState<SortKey>("recomendados");
  const [ramo, setRamo] = useState("todos");

  // Base: tudo que esta pronto pra revisar (e nao arquivado). Dela saem o filtro
  // de ramo e a ordem.
  const baseQueue = useMemo(
    () => leads.filter((l) => l.status === "rascunho_pronto" && !l.archived),
    [leads],
  );
  const ramoOptions = useMemo(() => {
    const set = new Set<string>();
    for (const l of baseQueue) if (l.category) set.add(l.category);
    return [
      { value: "todos", label: "Todos os ramos" },
      ...[...set].sort((a, b) => a.localeCompare(b)).map((c) => ({ value: c, label: c })),
    ];
  }, [baseQueue]);
  // leads "pulados" vao pro fim da fila (revisita depois), sem mexer no banco.
  const [skipped, setSkipped] = useState<string[]>([]);
  const queue = useMemo(() => {
    const filtrada = ramo === "todos" ? baseQueue : baseQueue.filter((l) => l.category === ramo);
    const sorted = sortQueue(filtrada, sortBy);
    if (skipped.length === 0) return sorted;
    const skipSet = new Set(skipped);
    const front = sorted.filter((l) => !skipSet.has(l.id));
    const back = skipped
      .map((id) => sorted.find((l) => l.id === id))
      .filter((l): l is Lead => Boolean(l));
    return [...front, ...back];
  }, [baseQueue, ramo, sortBy, skipped]);

  const [edits, setEdits] = useState<Record<string, { m1: string; m2: string }>>({});
  const [sendLead, setSendLead] = useState<Lead | null>(null);
  const sendingRef = useRef(false); // trava re-entrada (2 Enter rapidos / clique duplo)
  const [tally, setTally] = useState({ approved: 0, discarded: 0, archived: 0 });

  const cur = queue[0];
  const reviewed = tally.approved + tally.discarded + tally.archived;
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
      toast.success("Descartado. Não aparece mais pra você.", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            await repo.transition(target.id, "enriquecido", "human");
            await refresh();
            toast.message("Voltou pra revisão.");
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
      // NAO transiciona aqui: o lead so sai da fila quando for ENVIADO de fato.
      // Evita o "aprovou, fechou o modal sem querer e o lead sumiu sem enviar".
      // rascunho_pronto -> enviado e uma transicao valida (state-machine), e o
      // celular/funil tratam rascunho_pronto como "pra enviar", entao nada quebra.
      setSendLead({ ...cur, draft_msg1: m.m1, draft_msg2: m.m2 });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao aprovar");
    }
  }, [cur, repo, edits]);

  const markSent = useCallback(async () => {
    if (!sendLead || sendingRef.current) return;
    sendingRef.current = true;
    try {
      await repo.transition(sendLead.id, "enviado", "human");
      setTally((t) => ({ ...t, approved: t.approved + 1 }));
      setSendLead(null);
      await refresh();
      toast.success("Pronto. Marquei como enviado.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao marcar enviado");
    } finally {
      sendingRef.current = false;
    }
  }, [sendLead, repo, refresh]);

  // Abrir o WhatsApp e marcar enviado (compartilhado pelo botao e pela tecla Enter).
  const sendNow = useCallback(() => {
    if (!sendLead) return;
    openWhatsApp(
      sendLead.whatsapp ?? sendLead.phone,
      [sendLead.draft_msg1, sendLead.draft_msg2].filter(Boolean).join("\n\n"),
    );
    void markSent();
  }, [sendLead, markSent]);

  // Fechar o modal sem enviar: o lead continua na fila (nao virou enviado).
  const closeSend = useCallback(() => {
    setSendLead(null);
    toast.message("Voltei pra fila. Quando quiser, é só abrir e enviar.");
  }, []);

  const archive = useCallback(async () => {
    if (!cur) return;
    const target = cur;
    try {
      await repo.setArchived(target.id, true);
      setTally((t) => ({ ...t, archived: t.archived + 1 }));
      await refresh();
      toast.success("Arquivado. Sai da fila, mas não some.", {
        action: {
          label: "Desfazer",
          onClick: async () => {
            await repo.setArchived(target.id, false);
            setTally((t) => ({ ...t, archived: Math.max(0, t.archived - 1) }));
            await refresh();
            toast.message("Voltou pra fila.");
          },
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao arquivar");
    }
  }, [cur, repo, refresh]);

  // Pular: manda o lead atual pro fim da fila (revisita depois), sem mexer no banco.
  const skip = useCallback(() => {
    if (!cur) return;
    const id = cur.id;
    setSkipped((s) => [...s.filter((x) => x !== id), id]);
    toast.message("Pulei. Volta no fim da fila.", {
      action: { label: "Desfazer", onClick: () => setSkipped((s) => s.filter((x) => x !== id)) },
    });
  }, [cur]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "TEXTAREA" || tag === "INPUT" || tag === "SELECT") return;
      // Modal de envio aberto: Enter envia, Esc fecha. Atalhos de triagem ficam off.
      if (sendLead) {
        if (e.key === "Enter") {
          e.preventDefault();
          sendNow();
        } else if (e.key === "Escape") {
          e.preventDefault();
          closeSend();
        }
        return;
      }
      if (e.key === "a" || e.key === "A") void approve();
      if (e.key === "d" || e.key === "D") void discard();
      if (e.key === "s" || e.key === "S") void archive();
      if (e.key === "ArrowRight" || e.key === "ArrowDown") {
        e.preventDefault();
        skip();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [approve, discard, archive, skip, sendLead, sendNow, closeSend]);

  // carregando: skeleton (evita piscar o estado de "primeiro uso" antes dos
  // leads chegarem).
  if (loading) {
    return (
      <div className="mx-auto max-w-[1180px]">
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[1fr_420px]">
          <div className="space-y-4 rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow)]">
            <div className="flex items-center gap-4">
              <Skeleton className="size-13 rounded-[14px]" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-5 w-1/2" />
                <Skeleton className="h-3.5 w-1/3" />
              </div>
            </div>
            <Skeleton className="h-16 w-full rounded-[14px]" />
            <Skeleton className="h-24 w-full rounded-[14px]" />
          </div>
          <div className="space-y-3 rounded-[20px] border border-border bg-card p-6 shadow-[var(--shadow)]">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-20 w-full rounded-xl" />
            <Skeleton className="h-12 w-full rounded-[14px]" />
          </div>
        </div>
      </div>
    );
  }

  // fila vazia (nada pronto pra revisar, independente de filtro). Distingue o
  // PRIMEIRO USO (conta sem nenhum lead) de "revisou tudo".
  if (baseQueue.length === 0) {
    const primeiroUso = leads.length === 0;
    return (
      <div className="mx-auto max-w-[1180px]">
        <div className="fu mx-auto mt-16 max-w-[520px] rounded-[22px] border border-border bg-card p-14 text-center shadow-[var(--shadow)]">
          <div
            className={cn(
              "mx-auto mb-5 flex size-18 items-center justify-center rounded-[20px]",
              primeiroUso ? "bg-brand-50 text-brand" : "bg-success-bg text-success",
            )}
          >
            {primeiroUso ? <MagnifyingGlass size={36} weight="bold" /> : <CheckCircle size={38} weight="fill" />}
          </div>
          <div className="font-heading text-2xl font-bold">
            {primeiroUso ? "Bora encher sua fila" : "Fila zerada, parabéns."}
          </div>
          <p className="mt-2 text-muted-foreground">
            {primeiroUso
              ? "Você ainda não tem leads. Rode sua primeira busca: escolha o ramo e a região, e o robô traz os negócios pra você abordar."
              : `Você revisou tudo. Aprovou ${tally.approved} e descartou ${tally.discarded} agora. Vou continuar buscando e te aviso quando chegar gente nova.`}
          </p>
          <Link
            href="/buscar"
            className="mt-6 inline-flex items-center gap-2 rounded-full px-6 py-3 text-sm font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            {primeiroUso ? "Fazer minha primeira busca" : "Buscar mais agora"} <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    );
  }

  const service = cur ? (SERVICE_META[cur.service_target] ?? SERVICE_META.indefinido) : SERVICE_META.indefinido;
  const msg = cur ? msgOf(cur) : { m1: "", m2: "" };
  const pct = total ? Math.round((reviewed / total) * 100) : 0;
  const ramoLabel = ramoOptions.find((o) => o.value === ramo)?.label ?? "esse ramo";

  return (
    <div className="mx-auto max-w-[1180px]">
      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center gap-3.5">
          <div className="text-sm text-muted-foreground">
            Revisando <strong className="text-foreground">{cur ? reviewed + 1 : reviewed} de {total}</strong>
          </div>
          <div className="h-1.5 w-[160px] overflow-hidden rounded-full bg-[var(--inset)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: "var(--grad)" }} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12.5px] font-semibold text-faint">Ordenar por</span>
          <Dropdown
            value={sortBy}
            onChange={(v) => setSortBy(v as SortKey)}
            options={SORT_OPTIONS}
            ariaLabel="Ordenar a fila"
            align="end"
            className="w-[188px]"
          />
          <Dropdown
            value={ramo}
            onChange={setRamo}
            options={ramoOptions}
            ariaLabel="Filtrar por ramo"
            align="end"
            className="w-[168px]"
          />
          <span className="hidden items-center gap-1.5 text-[12px] text-faint md:flex">
            <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">A</kbd>
            aprovar
            <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">S</kbd>
            arquivar
            <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">D</kbd>
            descartar
            <kbd className="rounded-md border border-border-2 bg-[var(--inset)] px-1.5 py-0.5 font-heading font-semibold text-ink-2">→</kbd>
            pular
          </span>
        </div>
      </div>

      {!cur ? (
        <div className="fu mt-2 rounded-[20px] border border-border bg-card p-10 text-center text-muted-foreground shadow-[var(--shadow)]">
          Nenhum lead pronto em <strong className="text-foreground">{ramoLabel}</strong> agora. Troca o ramo ou volta pra Todos os ramos.
        </div>
      ) : (
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

              {/* Conferir o negocio por fora (puxar info e checar se anuncia) */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <ExternalChip href={googleSearchUrl(cur)} icon={<GoogleLogo size={13} weight="bold" />}>
                  Ver no Google
                </ExternalChip>
                <ExternalChip href={googleMapsUrl(cur)} icon={<MapTrifold size={13} weight="bold" />}>
                  No Maps
                </ExternalChip>
                {metaAdsUrl(cur) && (
                  <ExternalChip href={metaAdsUrl(cur)!} icon={<Megaphone size={13} weight="bold" />}>
                    Anúncios (Meta)
                  </ExternalChip>
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-4.5 p-6">
            {/* motivo */}
            <div className="rounded-[14px] border border-brand-100 bg-brand-50 p-4">
              <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                <Sparkle size={15} weight="fill" /> Por que esse é um bom alvo
              </div>
              <div className="text-[14.5px] leading-relaxed text-ink-2">{cur.score_reason?.summary}</div>
            </div>

            {/* dados grid */}
            <div className="grid grid-cols-1 gap-px overflow-hidden rounded-[14px] border border-border bg-border sm:grid-cols-2">
              {fichaRows(cur).map((r) => (
                <div key={r.k} className="bg-card p-3.5">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-faint">{r.k}</div>
                  {r.href ? (
                    <a
                      href={r.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline"
                    >
                      <Globe size={15} weight="bold" />
                      {r.v}
                    </a>
                  ) : (
                    <div className="text-sm font-semibold">{r.v}</div>
                  )}
                </div>
              ))}
            </div>

            {/* diagnostico do site: sinais enriquecidos de graca (anuncio real,
                PageSpeed, agendamento, e-commerce, canais). Mesmos chips da ficha. */}
            {(() => {
              const chips = siteSignalChips(cur.site_signals);
              if (chips.length === 0) return null;
              return (
                <div>
                  <div className="mb-2 text-xs font-bold uppercase tracking-wider text-faint">Diagnóstico do site</div>
                  <div className="flex flex-wrap gap-2">
                    {chips.map((chip, i) => (
                      <span key={i} className={cn("rounded-full px-2.5 py-1 text-[12px]", signalChipClass(chip.variant))}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })()}

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
                <Info size={14} /> Quem envia é você, no seu ritmo. Nada sai sozinho.
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            {/* linha secundaria: pular (adia) + arquivar (sai da fila) */}
            <div className="flex gap-2.5">
              <button
                onClick={skip}
                title="Pular pro fim da fila (tecla seta)"
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-border-2 bg-card p-3 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2"
              >
                <SkipForward size={16} weight="bold" /> Pular
              </button>
              <button
                onClick={() => void archive()}
                title="Arquivar (tecla S)"
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] border border-border-2 bg-card p-3 text-[13.5px] font-semibold text-ink-2 transition-colors hover:bg-surface-2"
              >
                <Archive size={16} weight="bold" /> Arquivar
              </button>
            </div>
            {/* linha principal: descartar + aprovar */}
            <div className="flex gap-3">
              <button
                onClick={discard}
                title="Descartar (tecla D)"
                className="flex w-[120px] flex-none items-center justify-center gap-2 rounded-[14px] border border-border-2 bg-card p-4 text-sm font-bold text-danger transition-colors hover:bg-danger-bg"
              >
                <X size={17} weight="bold" /> Descartar
              </button>
              <button
                onClick={approve}
                title="Aprovar (tecla A)"
                className="flex flex-1 items-center justify-center gap-2 rounded-[14px] p-4 text-sm font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--grad)" }}
              >
                <Check size={18} weight="bold" /> Aprovar e preparar envio
              </button>
            </div>
          </div>
        </div>
      </div>
      )}

      {/* modal de envio */}
      {sendLead && (
        <div
          onClick={closeSend}
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
                <ShieldCheck size={16} className="text-success" /> Você manda do seu número, com a própria mão. O
                4YU CRM nunca dispara sozinho.
              </div>
            </div>
            <div className="flex flex-col gap-2.5 px-6 pb-6">
              <button
                type="button"
                onClick={sendNow}
                className="flex w-full items-center justify-center gap-2 rounded-[14px] p-4 text-sm font-bold text-white"
                style={{ background: "var(--wa)" }}
              >
                <WhatsappLogo size={20} weight="fill" /> Abrir conversa e enviar
              </button>
              <button
                onClick={markSent}
                className="w-full rounded-[14px] border border-border-2 bg-card p-3 text-sm font-semibold text-ink-2"
              >
                Já mandei, marcar como enviado
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
