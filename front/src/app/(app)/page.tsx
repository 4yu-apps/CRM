"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  BellRinging,
  CheckCircle,
  MagnifyingGlass,
  Sparkle,
  Warning,
  Footprints,
  Trash,
  NotePencil,
  ScanSmiley,
  ChatCircleDots,
  CalendarCheck,
  Snowflake,
  CaretDown,
  CaretUp,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { useAuth } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { fmtRelative } from "@/lib/format";
import { meetingsWithin, fmtMeetingWhen } from "@/lib/meetings";
import { cn } from "@/lib/utils";
import { QuickActions } from "@/components/quick-actions";
import type { LeadsRepo } from "@/lib/repo";
import type { ActivityEvent, ActivityType, Lead } from "@/lib/types";

// ---- helpers ----------------------------------------------------------------

// Marca da ultima vez que o usuario viu o feed (localStorage, por dispositivo).
const ACTIVITY_SEEN_KEY = "gp-activity-seen-at";

function saudacao(): string {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

function primeiroNome(email: string | null): string {
  if (!email) return "por aqui";
  const parte = email.split("@")[0];
  // capitaliza a primeira parte antes de qualquer separador
  const nome = parte.split(/[._-]/)[0];
  return nome.charAt(0).toUpperCase() + nome.slice(1);
}

function inicioSemana(): Date {
  const d = new Date();
  const dia = d.getDay(); // 0 = domingo
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - dia);
  return d;
}

function inicioMes(): Date {
  const d = new Date();
  d.setDate(1);
  d.setHours(0, 0, 0, 0);
  return d;
}

// #3 — limiar de "esfriando": dias sem nenhum toque pra um lead enviado virar alerta.
const COOLING_DAYS = 5;

const ACTIVITY_ICON: Record<ActivityType, React.ComponentType<{ size: number }>> = {
  busca: MagnifyingGlass,
  enriquecimento: ScanSmiley,
  descarte: Trash,
  rascunho: NotePencil,
  varredura: Footprints,
};

// ---- componente principal ---------------------------------------------------

export default function InicioPage() {
  const { user } = useAuth();
  const { leads, loading: leadsLoading, error: leadsError, refresh: refreshLeads, repo } = useLeads();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);
  const [activityError, setActivityError] = useState(false);

  // Feed "o que rolou enquanto voce nao tava". A janela tem um piso rolante de
  // 24h (o "reset diario": abrindo todo dia, voce so ve o dia) e estica pra tras
  // ate a sua ultima visita quando voce fica dias fora (acumula as rodadas do
  // cron que voce perdeu). Sempre limitado a 30 itens. A "ultima visita" mora no
  // localStorage (por dispositivo) e e atualizada a cada abertura.
  const loadActivity = useCallback(() => {
    const DIA = 24 * 60 * 60 * 1000;
    let ultimaVisita = 0;
    try {
      const raw = localStorage.getItem(ACTIVITY_SEEN_KEY);
      ultimaVisita = raw ? Number(raw) || 0 : 0;
    } catch {
      /* sem localStorage: trata como primeiro acesso */
    }
    const agora = Date.now();
    // Piso de 24h; se a ultima visita for mais antiga, a janela estica ate ela.
    const janelaInicio = ultimaVisita > 0 ? Math.min(agora - DIA, ultimaVisita) : agora - DIA;

    setActivityError(false);
    setActivityLoading(true);
    void getRepo()
      .listActivity(30)
      .then((ev) => {
        const naJanela = ev.filter((e) => +new Date(e.created_at) > janelaInicio).slice(0, 30);
        setActivity(naJanela);
        setActivityLoading(false);
        try {
          localStorage.setItem(ACTIVITY_SEEN_KEY, String(agora));
        } catch {
          /* ignora */
        }
      })
      .catch(() => {
        // Antes engolia o erro virando "vazio". Agora distingue: erro + retry.
        setActivityError(true);
        setActivityLoading(false);
      });
  }, []);

  useEffect(() => {
    // Carga inicial de uma fonte externa; o callback atualiza loading/resultado.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadActivity();
  }, [loadActivity]);

  const nome = user?.name?.trim() || primeiroNome(user?.email ?? null);
  const cumprimento = saudacao();

  // contadores derivados de leads reais
  const prontos = useMemo(
    () => leads.filter((l) => l.status === "rascunho_pronto").length,
    [leads],
  );

  const semanaInicio = inicioSemana();
  const mesInicio = inicioMes();

  const novosSemana = useMemo(
    () => leads.filter((l) => new Date(l.created_at) >= semanaInicio).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads],
  );

  const prontosPraRevisar = useMemo(
    // so os que tem a mensagem pronta (na fila). 'enriquecido' ainda esta sendo
    // processado, nao conta como pronto.
    () => leads.filter((l) => l.status === "rascunho_pronto").length,
    [leads],
  );

  const fechadosMes = useMemo(
    () =>
      leads.filter(
        (l) => l.status === "fechado" && new Date(l.created_at) >= mesInicio,
      ).length,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [leads],
  );

  // Follow-ups vencendo: leads ativos com data marcada pra hoje ou ja atrasada.
  // E o "lembrete pra nao esquecer" que aparece logo no login.
  const followupsDevidos = useMemo(() => {
    const agora = new Date();
    const fimDeHoje = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), 23, 59, 59, 999);
    const finais = ["fechado", "perdido", "sem_interesse", "descartado"];
    return leads
      .filter((l) => l.followup_at && !finais.includes(l.status))
      .filter((l) => new Date(l.followup_at!) <= fimDeHoje)
      .sort((a, b) => +new Date(a.followup_at!) - +new Date(b.followup_at!));
  }, [leads]);

  // "O que fazer agora": quem respondeu (precisa da sua resposta) e reunioes
  // proximas. Junto com os follow-ups, formam a fila de acao do login.
  const precisaResponder = useMemo(
    () => leads.filter((l) => l.status === "respondeu" || l.status === "interessado"),
    [leads],
  );
  const reunioes = useMemo(() => meetingsWithin(leads, 24), [leads]);
  const [renderedAt] = useState(() => Date.now());

  // #3 — Esfriando: enviados/sem resposta, SEM follow-up agendado (senao caem em
  // Follow-ups) e sem nenhum toque ha COOLING_DAYS+ dias. O ralo silencioso.
  const esfriando = useMemo(() => {
    const limite = renderedAt - COOLING_DAYS * 24 * 60 * 60 * 1000;
    return leads
      .filter((l) => l.status === "enviado" || l.status === "sem_resposta")
      .filter((l) => !l.followup_at)
      .filter((l) => +new Date(l.updated_at) < limite)
      .sort((a, b) => +new Date(a.updated_at) - +new Date(b.updated_at)); // mais frio primeiro
  }, [leads, renderedAt]);

  const temAcao =
    precisaResponder.length + followupsDevidos.length + reunioes.length + esfriando.length > 0;

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
      {leadsError && (
        <div className="rounded-[16px] border border-danger/30 bg-danger-bg px-5 py-4 text-[14px] text-danger">
          Não consegui carregar seus leads: {leadsError}
          <button type="button" onClick={() => void refreshLeads()} className="ml-3 font-semibold underline">
            Tentar de novo
          </button>
        </div>
      )}
      {/* ---- HERO ---- */}
      <div
        className="fu relative overflow-hidden rounded-[22px] p-10 text-white shadow-[var(--shadow-md)]"
        style={{ background: "var(--grad)" }}
      >
        {/* ornamentos decorativos */}
        <div className="pointer-events-none absolute right-[-40px] top-[-60px] size-[280px] rounded-full border border-white/20" />
        <div className="pointer-events-none absolute right-[30px] top-[40px] size-[170px] rounded-full border border-white/15" />

        <div className="relative max-w-[640px]">
          <div className="text-[13px] font-semibold tracking-[.04em] opacity-85">
            {cumprimento}, {nome}
          </div>

          <h1 className="mt-2.5 font-heading text-[34px] font-bold leading-[1.1] tracking-tight">
            {leadsLoading ? (
              "Carregando seus leads..."
            ) : prontos > 0 ? (
              <>
                Já tem {prontos} {prontos === 1 ? "lead bom" : "leads bons"}
                <br />
                te esperando.
              </>
            ) : (
              <>
                Fila zerada por enquanto.
                <br />
                Que tal buscar mais?
              </>
            )}
          </h1>

          <p className="mt-2 max-w-[520px] text-[15.5px] opacity-90">
            {prontos > 0
              ? "A busca do dia já foi feita. Cada um chega com a ficha completa e a primeira mensagem pronta. É só revisar e aprovar."
              : "Quando chegar gente nova eu te aviso. Por enquanto você pode buscar mais ou checar o que rolou."}
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Link
              href="/fila"
              className="flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-[15px] font-bold text-brand shadow-[0_4px_14px_rgba(0,0,0,.14)]"
              style={{ color: "var(--brand-700)" }}
            >
              Revisar a fila <ArrowRight size={17} />
            </Link>
            <Link
              href="/buscar"
              className="flex items-center gap-2 rounded-full border border-white/40 bg-white/16 px-6 py-3.5 text-[15px] font-semibold text-white"
            >
              Buscar mais agora
            </Link>
          </div>
        </div>
      </div>

      {/* ---- O QUE FAZER AGORA ---- */}
      {!leadsLoading && temAcao && (
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          <div className="mb-4 flex items-center gap-2 text-base font-bold">
            <BellRinging size={18} weight="fill" className="text-brand" /> O que fazer agora
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <ActionBucket
              icon={<ChatCircleDots size={15} weight="fill" />}
              title="Responderam"
              tone="green"
              leads={precisaResponder}
              labelOf={(l) => (l.status === "interessado" ? "interessado" : "respondeu")}
              repo={repo}
              onDone={refreshLeads}
            />
            <ActionBucket
              icon={<BellRinging size={15} weight="fill" />}
              title="Follow-ups"
              tone="amber"
              leads={followupsDevidos}
              labelOf={(l) => {
                const due = new Date(l.followup_at!);
                const hoje = new Date();
                const inicioHoje = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
                return due < inicioHoje ? "atrasado" : "hoje";
              }}
              repo={repo}
              onDone={refreshLeads}
            />
            <ActionBucket
              icon={<CalendarCheck size={15} weight="fill" />}
              title="Reuniões (24h)"
              tone="brand"
              leads={reunioes.map((r) => r.lead)}
              labelOf={(l) => {
                const r = reunioes.find((x) => x.lead.id === l.id);
                return r ? fmtMeetingWhen(r.at) : "";
              }}
              repo={repo}
              onDone={refreshLeads}
            />
            <ActionBucket
              icon={<Snowflake size={15} weight="fill" />}
              title={`Esfriando (+${COOLING_DAYS}d)`}
              tone="sky"
              leads={esfriando}
              labelOf={(l) => {
                const dias = Math.floor((Date.now() - +new Date(l.updated_at)) / (24 * 60 * 60 * 1000));
                return `há ${dias}d`;
              }}
              repo={repo}
              onDone={refreshLeads}
            />
          </div>
        </div>
      )}

      {/* ---- GRID: feed + resumo ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ---- FEED DE ATIVIDADE ---- */}
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-base font-bold">O que rolou enquanto você não tava</div>
            <span className="text-[12px] font-semibold uppercase tracking-[.1em] text-faint">
              Recente
            </span>
          </div>

          {activityLoading ? (
            <div className="flex flex-col gap-3">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="flex gap-4 py-3">
                  <div className="size-9 flex-none animate-pulse rounded-[10px] bg-border" />
                  <div className="flex-1 space-y-2">
                    <div className="h-3.5 w-3/4 animate-pulse rounded bg-border" />
                    <div className="h-3 w-1/3 animate-pulse rounded bg-border" />
                  </div>
                </div>
              ))}
            </div>
          ) : activityError ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Warning size={28} className="text-danger" />
              <div className="text-sm text-muted-foreground">Não consegui carregar a atividade.</div>
              <button
                type="button"
                onClick={loadActivity}
                className="text-sm font-semibold text-brand hover:underline"
              >
                Tentar de novo
              </button>
            </div>
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Sparkle size={32} className="text-faint" />
              <div className="text-sm text-muted-foreground">
                Ainda não tem nada registrado. Quando a busca começar, tudo aparece aqui.
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-0.5">
              {activity.map((ev) => {
                const Icon = ACTIVITY_ICON[ev.tipo] ?? Sparkle;
                return (
                  <div key={ev.id} className="flex gap-4 py-3 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
                    <div className="flex size-9 flex-none items-center justify-center rounded-[10px] bg-brand-50 text-brand">
                      <Icon size={18} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-[14.5px] font-semibold leading-snug">{ev.text}</div>
                      <div className="mt-0.5 text-[12.5px] text-faint">
                        {fmtRelative(ev.created_at)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* indicador de varredura ativa */}
          <div className="mt-4 flex items-center gap-3 rounded-xl bg-[var(--inset)] px-4 py-3.5">
            <span
              className="size-2.5 flex-none rounded-full bg-brand"
              style={{ animation: "pulse 1.8s ease-in-out infinite" }}
            />
            <span className="text-[13.5px] text-ink-2">
              A busca continua rodando em segundo plano. Quando chegar gente nova eu te aviso.
            </span>
          </div>
        </div>

        {/* ---- RESUMO DA SEMANA ---- */}
        <div className="flex flex-col gap-6">
          {/* card semana */}
          <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
            <div className="mb-4 text-[13px] font-semibold text-muted-foreground">
              Resumo da semana
            </div>

            <div className="flex flex-col gap-0">
              <StatRow
                label="Novos chegando"
                value={leadsLoading ? "..." : String(novosSemana)}
              />
              <StatRow
                label="Prontos pra revisar"
                value={leadsLoading ? "..." : String(prontosPraRevisar)}
              />
              <StatRow
                label="Fechados no mês"
                value={leadsLoading ? "..." : String(fechadosMes)}
              />
              <div className="flex items-center justify-between py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
                <span className="text-[13.5px] text-muted-foreground">Nunca repetiu ninguém</span>
                <span className="flex items-center gap-1.5 text-[13px] font-bold text-success">
                  <CheckCircle size={15} weight="fill" /> garantido
                </span>
              </div>
            </div>
          </div>

          {/* atalhos rapidos */}
          <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
            <div className="mb-4 text-[13px] font-semibold text-muted-foreground">
              Atalhos
            </div>
            <div className="flex flex-col gap-2">
              <ShortcutLink href="/fila" label="Ver a fila de aprovação" />
              <ShortcutLink href="/buscar" label="Iniciar nova busca" />
              <ShortcutLink href="/funil" label="Ver funil completo" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- sub-componentes --------------------------------------------------------

// Um balde do painel "o que fazer agora": titulo + contagem + ate 4 leads
// clicaveis. Some quando vazio.
function ActionBucket({
  icon,
  title,
  tone,
  leads,
  labelOf,
  repo,
  onDone,
}: {
  icon: React.ReactNode;
  title: string;
  tone: "green" | "amber" | "brand" | "sky";
  leads: Lead[];
  labelOf: (l: Lead) => string;
  repo: LeadsRepo;
  onDone: () => void | Promise<void>;
}) {
  if (leads.length === 0) return null;
  const headClass =
    tone === "green"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-400"
        : tone === "sky"
          ? "text-sky-700 dark:text-sky-400"
          : "text-brand";
  const pillClass =
    tone === "green"
      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
      : tone === "amber"
        ? "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
        : tone === "sky"
          ? "bg-sky-100 text-sky-700 dark:bg-sky-950/40 dark:text-sky-400"
          : "bg-brand-50 text-brand";
  return (
    <div className="rounded-[14px] border border-border bg-surface-2 p-4">
      <div className={cn("mb-2.5 flex items-center gap-1.5 text-[13px] font-bold", headClass)}>
        {icon} {title}
        <span className={cn("ml-auto rounded-full px-2 py-0.5 text-[11px] font-bold", pillClass)}>
          {leads.length}
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {leads.slice(0, 4).map((l) => (
          <BucketRow
            key={l.id}
            lead={l}
            label={labelOf(l)}
            pillClass={pillClass}
            repo={repo}
            onDone={onDone}
          />
        ))}
      </div>
      {leads.length > 4 && <div className="mt-2 text-[12px] text-faint">+{leads.length - 4} mais</div>}
    </div>
  );
}

// Linha de um bucket: nome (link pra ficha) + selo + caret que abre as acoes
// rapidas (#5/#6) sem sair da Inicio.
function BucketRow({
  lead,
  label,
  pillClass,
  repo,
  onDone,
}: {
  lead: Lead;
  label: string;
  pillClass: string;
  repo: LeadsRepo;
  onDone: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-[10px] border border-border bg-card">
      <div className="flex items-center gap-2 px-3 py-2">
        <Link
          href={`/ficha/${lead.id}`}
          className="min-w-0 flex-1 truncate text-[13px] font-semibold transition-colors hover:text-brand"
        >
          {lead.business_name ?? "Sem nome"}
        </Link>
        <span className={cn("flex-none rounded-full px-2 py-0.5 text-[10.5px] font-bold", pillClass)}>
          {label}
        </span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label="Ações rápidas"
          aria-expanded={open}
          className="flex-none text-faint transition-colors hover:text-brand"
        >
          {open ? <CaretUp size={14} /> : <CaretDown size={14} />}
        </button>
      </div>
      {open && (
        <div className="px-2.5 pb-2.5">
          <QuickActions lead={lead} repo={repo} onDone={onDone} />
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-border py-3.5 last:border-none">
      <span className="text-[13.5px] text-muted-foreground">{label}</span>
      <span className="font-heading text-[18px] font-bold">{value}</span>
    </div>
  );
}

function ShortcutLink({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between rounded-[12px] border border-border px-4 py-3 text-[14px] font-semibold transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
    >
      {label}
      <ArrowRight size={15} className="text-faint" />
    </Link>
  );
}
