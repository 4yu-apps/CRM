"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CheckCircle,
  MagnifyingGlass,
  Sparkle,
  Footprints,
  Trash,
  NotePencil,
  ScanSmiley,
} from "@phosphor-icons/react";
import { useLeads } from "@/hooks/use-leads";
import { useAuth } from "@/lib/auth";
import { getRepo } from "@/lib/repo";
import { fmtRelative } from "@/lib/format";
import type { ActivityEvent, ActivityType } from "@/lib/types";

// ---- helpers ----------------------------------------------------------------

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
  const { leads, loading: leadsLoading } = useLeads();
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [activityLoading, setActivityLoading] = useState(true);

  useEffect(() => {
    void getRepo()
      .listActivity(20)
      .then((ev) => {
        setActivity(ev);
        setActivityLoading(false);
      })
      .catch(() => setActivityLoading(false));
  }, []);

  const nome = primeiroNome(user?.email ?? null);
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
    () =>
      leads.filter(
        (l) => l.status === "rascunho_pronto" || l.status === "enriquecido",
      ).length,
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

  return (
    <div className="mx-auto flex max-w-[1100px] flex-col gap-6">
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
                Ja tem {prontos} {prontos === 1 ? "lead bom" : "leads bons"}
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
              ? "O garimpo do dia ja foi feito. Cada um chega com a ficha completa e a primeira mensagem pronta. E so revisar e aprovar."
              : "Quando chegar gente nova eu te aviso. Por enquanto voce pode buscar mais ou checar o que rolou."}
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

      {/* ---- GRID: feed + resumo ---- */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.6fr_1fr]">
        {/* ---- FEED DE ATIVIDADE ---- */}
        <div className="fu rounded-[18px] border border-border bg-card p-6 shadow-[var(--shadow)]">
          <div className="mb-5 flex items-center justify-between">
            <div className="text-base font-bold">O que rolou enquanto voce nao tava</div>
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
          ) : activity.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <Sparkle size={32} className="text-faint" />
              <div className="text-sm text-muted-foreground">
                Ainda nao tem nada registrado. Quando o garimpo comecar, tudo aparece aqui.
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
              O garimpo continua rodando em segundo plano. Quando chegar gente nova eu te aviso.
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
                label="Fechados no mes"
                value={leadsLoading ? "..." : String(fechadosMes)}
              />
              <div className="flex items-center justify-between py-3.5 [&:not(:last-child)]:border-b [&:not(:last-child)]:border-border">
                <span className="text-[13.5px] text-muted-foreground">Nunca repetiu ninguem</span>
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
              <ShortcutLink href="/fila" label="Ver a fila de aprovacao" />
              <ShortcutLink href="/buscar" label="Iniciar nova busca" />
              <ShortcutLink href="/leads" label="Ver todos os leads" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- sub-componentes --------------------------------------------------------

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
