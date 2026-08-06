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
  Coffee,
  Copy,
  CurrencyCircleDollar,
  ForkKnife,
  Hamburger,
  Info,
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
import { DealCard } from "@/components/deal-card";
import { PaymentsCard } from "@/components/payments-card";
import { LeadTimeline } from "@/components/lead-timeline";
import { LeadFiles } from "@/components/lead-files";
import { TagsEditor } from "@/components/tags-editor";
import { waSend, openWhatsApp } from "@/lib/whatsapp";
import { Skeleton } from "@/components/skeleton";
import { googleSearchUrl, googleMapsUrl } from "@/lib/links";
import { siteSignalChips, signalChipClass, signalFactClass, type SignalFact } from "@/lib/site-signals";
import { marketingSignalChips } from "@/lib/marketing-signals";
import { legalFacts } from "@/lib/legal-signals";
import { useAuth } from "@/lib/auth";
import { openState } from "@/lib/business-hours";
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

function fmtDateOnly(value?: string | null): string {
  if (!value) return "-";
  const date = new Date(value.length === 10 ? `${value}T12:00:00` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

function fmtNumber(value?: number | null): string {
  return value == null ? "-" : new Intl.NumberFormat("pt-BR").format(value);
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

// Painel MARKETING-FIRST: presenca digital (Google + Instagram + canais). Lidera
// quando a area do dono e marketing; o site vira coadjuvante (recolhido).
function MarketingSignalsPanel({ lead }: { lead: Lead }) {
  const chips = marketingSignalChips(lead);
  if (chips.length === 0) return null;
  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-faint">Presença digital</span>
        {lead.updated_at && (
          <span className="text-[11px] text-faint" title="Quando o robô conferiu por último">
            verificado {fmtRelative(lead.updated_at)}
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

// Painel JURIDICO: como um advogado le a empresa (natureza, socios, capital,
// situacao, tempo de casa, assessoria aparente). Lidera quando a area do dono e
// advocacia; o site vira coadjuvante.
//
// A EXPOSICAO juridica aparece SO aqui, marcada como interna. E o outro lado da
// muralha: ela prioriza a fila e nunca entra na mensagem (ver o spec da area).
// A qualificação do sócio vem do ReceitaWS com o código da tabela na frente
// ("49-Socio-Administrador"). O código não diz nada pra quem lê.
function qualLegivel(qual: string): string {
  return qual.replace(/^\d+\s*-\s*/, "").replace(/-/g, " ").trim();
}

function LegalSignalsPanel({ lead }: { lead: Lead }) {
  const facts = legalFacts(lead);
  const exposure = lead.ai_signals?.exposure?.trim();
  const socios = (lead.site_signals?.socios ?? []).filter((s) => s.nome);
  if (facts.length === 0 && !exposure && socios.length === 0) return null;
  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-faint">Retrato jurídico</span>
        {lead.updated_at && (
          <span className="text-[11px] text-faint" title="Quando o robô conferiu por último">
            verificado {fmtRelative(lead.updated_at)}
          </span>
        )}
      </div>
      {/* Dados rotulados, nao chips: o valor por extenso ao lado do nome do
          campo. Ver o porque em legal-signals.ts. */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
        {facts.map((f) => (
          <StatTile key={f.label} fact={f} />
        ))}
      </div>
      {/* Quem sao os sócios, com nome. "3 sócios" prioriza; o nome diz QUEM
          decide e sustenta conversa de acordo de sócios e sucessão. Vem de
          graça no mesmo JSON da Receita. */}
      {socios.length > 0 && (
        <div className="mt-3 rounded-[10px] border border-border bg-surface px-3 py-2.5">
          <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-faint">
            Quadro societário
          </div>
          <ul className="flex flex-col gap-1">
            {socios.map((s, i) => (
              <li key={i} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                <span className="font-semibold text-ink">{s.nome}</span>
                {s.qual && <span className="text-[12px] text-faint">{qualLegivel(s.qual)}</span>}
                {s.desde && (
                  <span className="text-[12px] text-faint">
                    desde {new Date(s.desde).toLocaleDateString("pt-BR", { timeZone: "UTC" })}
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
      {exposure && (
        <div className="mt-3 rounded-[10px] border border-amber-500/25 bg-amber-500/[0.07] px-3 py-2.5">
          <div className="mb-0.5 text-[10.5px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-300">
            Só para você, não use na abordagem
          </div>
          <p className="text-[12.5px] leading-relaxed text-ink-2">{exposure}</p>
        </div>
      )}
    </div>
  );
}

type SignalGroup = { title: string; facts: SignalFact[] };

// Um quadradinho de estatística: rótulo em cima, valor embaixo. Valor ausente
// vira um "—" discreto (cinza), não some — o slot continua visível pro Eduardo
// saber o que ainda falta enriquecer.
function StatTile({ fact }: { fact: SignalFact }) {
  const known = fact.value != null && fact.value !== "";
  return (
    <div className="min-w-0 rounded-[12px] border border-border bg-surface-2/40 px-3.5 py-2.5">
      <div className="truncate text-[11px] text-muted-foreground">{fact.label}</div>
      {fact.href && known ? (
        <a
          href={fact.href}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-0.5 block truncate text-[14px] font-semibold text-brand hover:underline"
        >
          {fact.value}
        </a>
      ) : (
        // line-clamp em vez de truncate: valor cortado ("Sociedade Empresari…")
        // derrota o proposito de mostrar o dado por extenso. Duas linhas cabem
        // natureza juridica e CNAE sem estourar o tile.
        <div
          className={cn(
            "mt-0.5 line-clamp-2 text-[14px] font-semibold leading-snug",
            known ? signalFactClass(fact.tone) : "text-faint",
          )}
          title={known ? (fact.value ?? undefined) : undefined}
        >
          {known ? fact.value : "—"}
        </div>
      )}
    </div>
  );
}

// Um grupo de sinais (Reputação, Presença social...). Se TODO o grupo está
// vazio, mostra uma linha tracejada "ainda não medido" em vez de um mar de
// traços. Se tem ao menos um valor, mostra todos os slots (inclusive os vazios).
function SignalGroupBlock({ group }: { group: SignalGroup }) {
  if (group.facts.length === 0) return null;
  const known = group.facts.filter((f) => f.value != null && f.value !== "");
  return (
    <div>
      <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-faint">{group.title}</div>
      {known.length === 0 ? (
        <div className="rounded-[12px] border border-dashed border-border px-3.5 py-2.5 text-[12.5px] text-faint">
          ainda não medido
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4">
          {group.facts.map((f) => (
            <StatTile key={f.label} fact={f} />
          ))}
        </div>
      )}
    </div>
  );
}

// Regime tributario e CNAEs secundarios vivem em site_signals (jsonb), entao
// nao aparecem sozinhos como coluna do lead. Sao dado da Receita que estava
// sendo baixado e mostrado so como chip.
function regimeLabel(lead: Lead): string | null {
  const sig = lead.site_signals;
  if (sig?.mei === true) return "MEI";
  if (sig?.simples === true) return "Optante pelo Simples";
  if (sig?.simples === false) return "Fora do Simples";
  return null;
}

function cnaesLabel(lead: Lead): string | null {
  const cnaes = lead.site_signals?.cnaes_sec;
  if (!cnaes?.length) return null;
  return cnaes.length <= 2 ? cnaes.join(", ") : `${cnaes.slice(0, 2).join(", ")} +${cnaes.length - 2}`;
}

function RawSignalsPanel({ lead, juridico }: { lead: Lead; juridico: boolean }) {
  const social = lead.social_signals ?? {};
  const platforms = social.ad_platforms ?? lead.site_signals?.ad_platforms ?? [];
  const platformLabels: Record<string, string> = {
    meta: "Meta",
    google: "Google Ads",
    tiktok: "TikTok",
  };
  // canais extras como tiles CLICÁVEIS (abrir e ver a marca/posts/vídeos).
  const sg = lead.site_signals ?? {};
  const canalFacts: SignalFact[] = [];
  const addCanal = (label: string, has: boolean | undefined, url: string | null | undefined) => {
    if (url) canalFacts.push({ label, value: "Abrir canal", href: url });
    else if (has) canalFacts.push({ label, value: "Presente" });
  };
  addCanal("TikTok", sg.has_tiktok, sg.tiktok_url);
  addCanal("YouTube", sg.has_youtube, sg.youtube_url);
  addCanal("LinkedIn", sg.has_linkedin, sg.linkedin_url);
  const adsActive = social.ads_active ?? lead.ads_active;
  const adHref = adLibraryUrl(lead);
  const mapHref = lead.lat != null && lead.lng != null
    ? `https://www.google.com/maps?q=${lead.lat},${lead.lng}`
    : undefined;

  const groups: SignalGroup[] = [
    {
      title: "Reputação",
      facts: [
        { label: "Nota no Google", value: lead.rating != null ? `${lead.rating.toLocaleString("pt-BR")} / 5` : null },
        { label: "Avaliações", value: lead.reviews_count != null ? fmtNumber(lead.reviews_count) : null },
      ],
    },
    {
      title: "Presença social",
      facts: [
        { label: "Seguidores", value: social.followers != null ? fmtNumber(social.followers) : null },
        { label: "Ritmo de publicação", value: social.post_freq_label ?? null },
        { label: "Última postagem", value: social.last_post ? fmtDateOnly(social.last_post) : null },
        { label: "Saúde do perfil", value: social.ig_status ? (social.ig_status === "parado" ? "Parado" : "Ativo") : null },
        { label: "Interações médias", value: social.engagement != null ? fmtNumber(social.engagement) : null },
        ...canalFacts,
      ],
    },
    {
      title: "Anúncios",
      facts: [
        { label: "Anuncia?", value: adsActive != null ? (adsActive ? "Sim" : "Ainda não") : null },
        { label: "Anúncios ativos", value: social.ads_count != null ? fmtNumber(social.ads_count) : null },
        { label: "Anuncia desde", value: social.ads_since ? fmtDateOnly(social.ads_since) : null },
        { label: "Plataformas", value: platforms.length ? platforms.map((p) => platformLabels[p] ?? p).join(", ") : null },
        { label: "Verificação manual", value: adHref ? "Conferir na Biblioteca da Meta" : null, href: adHref },
      ],
    },
    {
      title: "Empresa",
      facts: [
        // CNPJ e natureza juridica abrem o bloco: pro advogado, sao o retrato
        // do que a empresa E, antes de qualquer numero. Sao os campos que a
        // Receita ja devolve e que so viravam chip.
        { label: "CNPJ", value: lead.cnpj ?? null },
        { label: "Natureza jurídica", value: lead.natureza_juridica ?? null },
        { label: "Data de abertura", value: lead.opened_on ? fmtDateOnly(lead.opened_on) : null },
        { label: "Situação cadastral", value: lead.company_status ?? null },
        { label: "Porte", value: lead.porte ?? null },
        { label: "Regime tributário", value: regimeLabel(lead) },
        { label: "Capital social", value: lead.capital_social != null ? fmtBRL(lead.capital_social) : null },
        { label: "Sócios", value: lead.socios_count != null ? fmtNumber(lead.socios_count) : null },
        { label: "Atividades secundárias", value: cnaesLabel(lead) },
        ...(juridico ? [] : [{ label: "Funcionamento", value: lead.opening_hours ?? null }]),
      ],
    },
    {
      title: "Localização",
      facts: [
        {
          label: "Coordenadas",
          value: lead.lat != null && lead.lng != null ? `${lead.lat.toFixed(5)}, ${lead.lng.toFixed(5)}` : null,
          href: mapHref,
        },
        // No modo juridico o horario nao cabe em "Empresa" (nao e leitura
        // juridica) mas continua sendo um fato util: vem pra ca, junto do onde.
        ...(juridico ? [{ label: "Funcionamento", value: lead.opening_hours ?? null }] : []),
      ],
    },
  ];

  // Ordem por area. Pro advogado a empresa vem primeiro: presenca social e
  // anuncios nao sao leitura juridica, e antes ele rolava por seguidores,
  // ritmo de publicacao e plataformas de anuncio antes de chegar no que importa.
  const byTitle = Object.fromEntries(groups.map((g) => [g.title, g]));
  // No modo juridico o grupo "Empresa" nao entra: o painel Retrato juridico,
  // logo acima, ja mostra os mesmos campos e mais alguns. Repetir a mesma
  // firmografia duas vezes na mesma tela e ruido, nao reforco.
  const ordem = juridico
    ? ["Reputação", "Localização"]
    : ["Reputação", "Presença social", "Anúncios", "Empresa", "Localização"];
  const principais = ordem.map((t) => byTitle[t]).filter(Boolean);
  const recolhidos = juridico
    ? ["Presença social", "Anúncios"].map((t) => byTitle[t]).filter(Boolean)
    : [];

  return (
    <section>
      <div className="mb-4 flex items-center gap-2">
        <Info size={16} weight="fill" className="text-brand" />
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-ink">Sinais do lead</h2>
        <span className="ml-auto text-[11px] text-faint">dados complementares, sem IA</span>
      </div>
      <div className="flex flex-col gap-5">
        {principais.map((g) => (
          <SignalGroupBlock key={g.title} group={g} />
        ))}
        {recolhidos.length > 0 && (
          <details className="rounded-[12px] border border-border bg-surface-2/40 px-3.5 py-2.5">
            <summary className="cursor-pointer text-[10px] font-bold uppercase tracking-[0.14em] text-faint">
              Presença digital (não é leitura jurídica)
            </summary>
            <div className="mt-3 flex flex-col gap-5">
              {recolhidos.map((g) => (
                <SignalGroupBlock key={g.title} group={g} />
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
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
  // A leitura da ficha segue a PROFISSAO do dono, nao o service_target do lead:
  // lead descartado vira "indefinido" (scoring.py), e o advogado recebia o
  // painel de presenca digital em cima de todo lead que nao passou no corte.
  const { profile } = useAuth();
  const souAdvogado =
    (profile?.professions ?? []).includes("advocacia") || profile?.profession === "advocacia";

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
  const hoursState = openState(lead.hours_struct);


  // Carteira: quem paga (ou pagava). Muda a moldura da tela, nao o conteudo.
  const ehCarteira = lead.status === "fechado" || lead.status === "cancelado";

  const statusAgeDays = daysInStatus(history);
  const statusAgeText = statusAgeLabel(statusAgeDays);



  return (
    <div className="mx-auto max-w-[880px]">
      {/* Breadcrumb. Cliente nao volta "pra fila": ele nao esta sendo
          prospectado, esta sendo atendido. */}
      <Link
        href={ehCarteira ? "/clientes" : "/fila"}
        className="mb-5 flex items-center gap-2 text-[14px] font-semibold text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft size={16} /> {ehCarteira ? "Voltar pra Clientes" : "Voltar pra fila"}
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
              {hoursState && !hoursState.open && (
                <span
                  className="rounded-full bg-amber-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-amber-700"
                  title="Fora do horário de atendimento — pode não responder agora"
                >
                  Fora do horário
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
        <div className="grid grid-cols-1 items-start gap-6 p-6 sm:p-7 lg:grid-cols-2">
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
                <DataRow label="Categoria / CNAE" value={lead.category ?? "-"} prov={provOf(provenance, "category")} />
                <DataRow label="Site" value={lead.website ? lead.website : "Não tem"} href={siteUrl(lead.website)} prov={provOf(provenance, "website")} />
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

          {/* Coluna direita: leitura + abordagem (os fatos brutos vão num
              painel de largura cheia abaixo, pra não duplicar nem espremer) */}
          <div className="flex flex-col gap-5">
            {/* Leitura da IA: raio-x do lead (segmento, maturidade, dor). */}
            {lead.ai_signals && (lead.ai_signals.segment || lead.ai_signals.maturity != null || lead.ai_signals.pain) && (
              <div className="rounded-[14px] border border-brand-100 bg-brand-50/60 p-4">
                <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-700">
                  <Sparkle size={15} weight="fill" /> Leitura da IA
                </div>
                {lead.ai_signals.segment && (
                  <div className="text-[14px] font-semibold text-ink">{lead.ai_signals.segment}</div>
                )}
                {lead.ai_signals.maturity != null && (
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-faint">Maturidade digital</span>
                    <span className="flex gap-1">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={cn(
                            "h-2 w-4 rounded-full",
                            n <= (lead.ai_signals?.maturity ?? 0) ? "bg-brand" : "bg-border",
                          )}
                        />
                      ))}
                    </span>
                    <span className="text-[12px] text-faint">{lead.ai_signals.maturity}/5</span>
                  </div>
                )}
                {lead.ai_signals.maturity_note && (
                  <p className="mt-1.5 text-[13px] text-ink-2">{lead.ai_signals.maturity_note}</p>
                )}
                {lead.ai_signals.pain && (
                  <p className="mt-2 text-[13.5px] text-ink-2">
                    <span className="font-semibold text-ink">Gancho: </span>
                    {lead.ai_signals.pain}
                  </p>
                )}
              </div>
            )}

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

            {/* Negocio (B8). Aparece com o lead fechado mesmo sem valor: o
                convite pra registrar vale mais que esconder o bloco. */}
            {(ehCarteira || lead.deal_value != null) && (
              <DealCard lead={lead} onSaved={load} />
            )}

            {/* Recebimentos: logo abaixo do negocio, porque a pergunta so faz
                sentido depois de "quanto foi combinado". So pra cliente ativo:
                cobrar quem ja saiu da carteira e cobranca, nao gestao, e a
                ficha de um cancelado nao deve pedir mais um recebimento. */}
            {lead.status === "fechado" && <PaymentsCard lead={lead} onSaved={load} />}

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

            {/* E-mail rascunhado (area de advocacia): canal proprio, registro
                formal, com assinatura e OAB. Sem envio automatico — o humano
                copia e manda, igual ao WhatsApp. */}
            {lead.draft_email_body && (
              <div>
                <div className="mb-2 text-[12px] font-bold uppercase tracking-wider text-faint">
                  E-mail rascunhado
                </div>
                <div className="flex flex-col gap-2.5">
                  <div>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-[11.5px] font-semibold text-faint">Assunto</span>
                      <button
                        type="button"
                        onClick={() => {
                          void navigator.clipboard.writeText(
                            `${lead.draft_email_subject ?? ""}\n\n${lead.draft_email_body ?? ""}`,
                          );
                        }}
                        className="flex items-center gap-1 text-[11.5px] font-semibold text-brand hover:underline"
                      >
                        <Copy size={12} /> Copiar e-mail
                      </button>
                    </div>
                    <div className="rounded-[12px] border border-border-2 bg-surface-2 px-3.5 py-2.5 text-[13px] font-semibold text-ink">
                      {lead.draft_email_subject || "(sem assunto)"}
                    </div>
                    <div className="mt-2 whitespace-pre-wrap rounded-[12px] border border-border-2 bg-surface-2 px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink-2">
                      {lead.draft_email_body}
                    </div>
                  </div>
                  {lead.email && (
                    <a
                      href={`mailto:${lead.email}?subject=${encodeURIComponent(lead.draft_email_subject ?? "")}&body=${encodeURIComponent(lead.draft_email_body ?? "")}`}
                      className="flex items-center justify-center gap-2 rounded-[13px] border border-border-2 bg-card p-3 text-[13px] font-semibold text-ink-2 hover:bg-accent"
                    >
                      Abrir no e-mail para {lead.email}
                    </a>
                  )}
                </div>
              </div>
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
                      <WhatsappLogo size={18} weight="fill" /> Abrir conversa e enviar abertura
                    </button>
                  )}
                  {/* Pitch e um passo OPCIONAL: so mandar depois, se a pessoa responder. */}
                  {lead.phone && lead.draft_msg2 && (
                    <button
                      type="button"
                      onClick={() => openWhatsApp(lead.whatsapp ?? lead.phone, lead.draft_msg2 ?? undefined)}
                      className="flex items-center justify-center gap-2 rounded-[13px] border border-border-2 bg-card p-3 text-[13px] font-semibold text-ink-2 hover:bg-accent"
                    >
                      <WhatsappLogo size={16} /> Enviar o pitch (passo 2, se responder)
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sinais do lead (largura cheia): diagnóstico do site + dashboard
            factual. Largura cheia pra os fatos curtos respirarem em grade, em
            vez de espremidos numa coluna estreita virando tabela de traços. */}
        <div className="border-t border-border p-6 sm:p-7">
          {souAdvogado || lead.service_target === "advocacia" ? (
            <>
              {/* Advocacia: o perfil jurídico lidera; o site vira coadjuvante
                  (só interessa por política de privacidade e termos). */}
              <div className="mb-5">
                <LegalSignalsPanel lead={lead} />
              </div>
              {lead.site_signals && siteSignalChips(lead.site_signals).length > 0 && (
                <details className="mb-5 rounded-[14px] border border-border bg-surface-2 p-4">
                  <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-faint">
                    Diagnóstico do site (opcional)
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {siteSignalChips(lead.site_signals).map((chip, i) => (
                      <span key={i} className={cn("rounded-full px-2.5 py-1 text-[12px]", signalChipClass(chip.variant))}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : lead.service_target === "marketing" ? (
            <>
              {/* Marketing: presença digital lidera; o site vira coadjuvante
                  (recolhido), aparece só se quiserem espiar. */}
              <div className="mb-5">
                <MarketingSignalsPanel lead={lead} />
              </div>
              {lead.site_signals && siteSignalChips(lead.site_signals).length > 0 && (
                <details className="mb-5 rounded-[14px] border border-border bg-surface-2 p-4">
                  <summary className="cursor-pointer text-[11px] font-bold uppercase tracking-wider text-faint">
                    Diagnóstico do site (opcional)
                  </summary>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {siteSignalChips(lead.site_signals).map((chip, i) => (
                      <span key={i} className={cn("rounded-full px-2.5 py-1 text-[12px]", signalChipClass(chip.variant))}>
                        {chip.label}
                      </span>
                    ))}
                  </div>
                </details>
              )}
            </>
          ) : (
            lead.site_signals && (
              <div className="mb-5">
                <SiteSignalsPanel signals={lead.site_signals} since={lead.updated_at} />
              </div>
            )
          )}
          <RawSignalsPanel
            lead={lead}
            juridico={souAdvogado || lead.service_target === "advocacia"}
          />
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

        {/* Linha do tempo: status + toques registrados, numa lista so. */}
        <LeadTimeline
          leadId={lead.id}
          history={history}
          activities={detail.activities}
          onChanged={load}
        />

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
