"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTheme } from "next-themes";
import {
  House,
  Tray,
  Funnel,
  AddressBook,
  CalendarBlank,
  ChartLineUp,
  MagnifyingGlass,
  DeviceMobile,
  GearSix,
  Sun,
  Moon,
  SignOut,
  Bell,
  BellRinging,
  ChatCircleDots,
  CalendarCheck,
  Snowflake,
  Sparkle,
  Handshake,
  ChatText,
  VideoCamera,
  MapPin,
  CaretLeft,
  CaretRight,
  ShieldStar,
  DotsThree,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { useT } from "@/lib/i18n";
import { useLeads } from "@/hooks/use-leads";
import { STATUS_META } from "@/lib/state-machine";
import { meetingsWithin, meetingModality, fmtMeetingWhen } from "@/lib/meetings";
import { buildNotifications, groupNotifications, type NotifKind } from "@/lib/notifications";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type NavItem = { href: string; label: string; Icon: typeof House };
type NavGroup = { label: string | null; items: NavItem[] };

// Grupos da sidebar (ordem e hierarquia).
const NAV_GROUPS: NavGroup[] = [
  { label: null, items: [{ href: "/", label: "Início", Icon: House }] },
  {
    label: "Prospecção",
    items: [
      { href: "/buscar", label: "Garimpar", Icon: MagnifyingGlass },
      { href: "/fila", label: "Fila de leads", Icon: Tray },
    ],
  },
  {
    label: "Pipeline",
    items: [
      { href: "/funil", label: "Funil", Icon: Funnel },
      { href: "/contatos", label: "Contatos", Icon: AddressBook },
      { href: "/agenda", label: "Agenda", Icon: CalendarBlank },
      { href: "/clientes", label: "Clientes", Icon: Handshake },
    ],
  },
  {
    label: "Análise",
    items: [{ href: "/resultados", label: "Resultados", Icon: ChartLineUp }],
  },
  {
    label: "Ferramentas",
    items: [
      { href: "/templates", label: "Templates", Icon: ChatText },
      { href: "/celular", label: "No celular", Icon: DeviceMobile },
    ],
  },
  {
    label: "Sistema",
    items: [{ href: "/config", label: "Configuração", Icon: GearSix }],
  },
];

// Itens que aparecem no menu inferior do celular (resto vai no "Mais").
const MOBILE_PRIMARY: string[] = ["/", "/fila", "/funil", "/contatos", "/buscar"];

const TITLES: Record<string, [string, string]> = {
  "/": ["Visão geral", "Seu ponto de partida do dia"],
  "/fila": ["Fila de leads", "Revise, ajuste e aprove"],
  "/funil": ["Funil", "Onde cada lead está agora"],
  "/contatos": ["Contatos", "Sua base inteira, num lugar só"],
  "/clientes": ["Clientes", "Quem você fechou e quem dá pra reaquecer"],
  "/agenda": ["Agenda", "Suas próximas reuniões"],
  "/resultados": ["Resultados", "Tá valendo a pena?"],
  "/templates": ["Templates", "Modelos de mensagem reutilizáveis"],
  "/buscar": ["Garimpar leads", "Sob comando, quando você quiser"],
  "/celular": ["No celular", "Acompanhe e envie pelo WhatsApp"],
  "/config": ["Configuração", "Ajuste uma vez, eu cuido do resto"],
  "/ficha": ["Ficha do lead", "Tudo que eu juntei sobre o negócio"],
  "/admin": ["Admin", "Gerencie todos os perfis do sistema"],
};

function isActive(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  if (href === "/fila") return pathname.startsWith("/fila") || pathname.startsWith("/ficha");
  return pathname.startsWith(href);
}

function titleFor(pathname: string): [string, string] {
  if (pathname.startsWith("/ficha")) return TITLES["/ficha"];
  return TITLES[pathname] ?? ["", ""];
}

// Acha contatos por nome/cidade/telefone para a busca rapida. Compartilhado
// entre a busca de desktop e o overlay do mobile.
function searchLeads(leads: Lead[], q: string): Lead[] {
  if (q.trim().length < 2) return [];
  const needle = q.trim().toLowerCase();
  const num = needle.replace(/\D/g, "");
  return leads
    .filter((l) => {
      const hay = [l.business_name, l.city, l.state, l.owner_name]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (hay.includes(needle)) return true;
      if (num) {
        const p = (l.phone ?? "").replace(/\D/g, "");
        const w = (l.whatsapp ?? "").replace(/\D/g, "");
        if (p.includes(num) || w.includes(num)) return true;
      }
      return false;
    })
    .slice(0, 7);
}

// Cada resultado da busca: clica e abre a ficha do lead.
function SearchResult({ lead, onPick }: { lead: Lead; onPick: () => void }) {
  return (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onPick}
      className="flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-3 text-left transition-colors last:border-0 hover:bg-accent/60"
    >
      <span className="line-clamp-2 text-[13.5px] font-semibold text-ink">
        {lead.business_name ?? "(sem nome)"}
      </span>
      <span className="truncate text-[12px] text-faint">
        {[lead.city, lead.state].filter(Boolean).join(" / ") || STATUS_META[lead.status].label}
      </span>
    </button>
  );
}

// Busca rapida no cabecalho: acha um contato por nome/cidade/telefone e abre a
// ficha na hora. Atalho pra quando voce so quer pular pra um lead especifico.
// So aparece no desktop; no mobile a lupa abre o MobileSearch (overlay).
function HeaderSearch({ leads, t }: { leads: Lead[]; t: (key: string, fallback?: string) => string }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches = searchLeads(leads, q);

  const go = (id: string) => {
    setQ("");
    setOpen(false);
    router.push(`/ficha/${id}`);
  };

  return (
    <div className="relative hidden md:block">
      <MagnifyingGlass size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
      <input
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && matches[0]) go(matches[0].id);
          if (e.key === "Escape") setOpen(false);
        }}
        placeholder={t("topbar.search", "Buscar contato...")}
        className="w-[240px] rounded-full border border-border bg-accent py-2 pl-9 pr-3 text-[13px] text-ink outline-none transition-all focus:w-[300px] focus:border-brand"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[420px] max-w-[80vw] overflow-hidden rounded-[14px] border border-border bg-card shadow-xl">
          {matches.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-muted-foreground">Nada encontrado</div>
          ) : (
            matches.map((l) => <SearchResult key={l.id} lead={l} onPick={() => go(l.id)} />)
          )}
        </div>
      )}
    </div>
  );
}

// Busca no mobile: a lupa fica no header em telas pequenas e abre um painel de
// busca em tela cheia. Mesma logica do desktop, leva a ficha do lead.
function MobileSearch({ leads, t }: { leads: Lead[]; t: (key: string, fallback?: string) => string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const matches = searchLeads(leads, q);

  const close = () => {
    setOpen(false);
    setQ("");
  };
  const go = (id: string) => {
    close();
    router.push(`/ficha/${id}`);
  };

  return (
    <div className="md:hidden">
      <button
        type="button"
        aria-label={t("topbar.search", "Buscar contato...")}
        onClick={() => setOpen(true)}
        className="flex size-9 items-center justify-center rounded-full border border-border bg-accent text-ink-2 transition-colors hover:text-brand"
      >
        <MagnifyingGlass size={17} />
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 backdrop-blur-sm">
          <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-3">
            <div className="relative flex-1">
              <MagnifyingGlass size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
              <input
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && matches[0]) go(matches[0].id);
                  if (e.key === "Escape") close();
                }}
                placeholder={t("topbar.search", "Buscar contato...")}
                className="w-full rounded-full border border-border bg-accent py-2.5 pl-9 pr-3 text-[14px] text-ink outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={close}
              className="flex-none rounded-lg px-3 py-2 text-[13px] font-semibold text-ink-2 transition-colors hover:bg-accent"
            >
              Cancelar
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {q.trim().length < 2 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                Digite ao menos 2 letras pra buscar.
              </div>
            ) : matches.length === 0 ? (
              <div className="px-4 py-6 text-center text-[13px] text-muted-foreground">
                Nada encontrado
              </div>
            ) : (
              <div className="divide-y divide-border bg-card">
                {matches.map((l) => (
                  <SearchResult key={l.id} lead={l} onPick={() => go(l.id)} />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// Icone por tipo de notificacao.
const NOTIF_ICON: Record<NotifKind, React.ComponentType<{ size: number; weight?: "fill" }>> = {
  respondeu: ChatCircleDots,
  reuniao: CalendarCheck,
  followup: BellRinging,
  renovacao: Handshake,
  esfriando: Snowflake,
  fila: Sparkle,
};

// Central de notificacoes: tudo que exige sua atencao agora, derivado dos leads.
// Respondeu, reuniao em 24h, follow-up de hoje, esfriando e novos na fila.
function NotificationBell({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const items = useMemo(() => buildNotifications(leads), [leads]);
  const groups = useMemo(() => groupNotifications(items), [items]);
  const total = items.length;

  return (
    <div className="relative">
      <button
        type="button"
        aria-label="Notificações"
        onClick={() => setOpen((o) => !o)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="relative flex size-9 items-center justify-center rounded-full border border-border bg-accent text-ink-2 transition-colors hover:text-brand"
      >
        <Bell size={17} weight={total ? "fill" : "regular"} />
        {total > 0 && (
          <span
            className="absolute -right-0.5 -top-0.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full px-1 text-[10px] font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            {total}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-[calc(100%+8px)] z-50 max-h-[70vh] w-[360px] max-w-[80vw] overflow-y-auto rounded-[14px] border border-border bg-card shadow-xl">
          <div className="sticky top-0 border-b border-border bg-card px-4 py-2.5 text-[12px] font-bold uppercase tracking-wider text-faint">
            {total === 0 ? "Tudo em dia" : `${total} pra você agora`}
          </div>
          {total === 0 ? (
            <div className="px-4 py-5 text-[13px] text-muted-foreground">
              Nada exigindo sua atenção agora. Quando alguém responder, uma reunião chegar ou um follow-up vencer, aparece aqui.
            </div>
          ) : (
            groups.map((g) => {
              const Icon = NOTIF_ICON[g.kind];
              return (
                <div key={g.kind}>
                  <div className="flex items-center gap-1.5 bg-surface-2 px-4 py-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">
                    <Icon size={12} weight="fill" /> {g.label}
                    <span className="ml-auto">{g.items.length}</span>
                  </div>
                  {g.items.slice(0, 6).map((it) => {
                    const lead = it.leadId ? leads.find((l) => l.id === it.leadId) : null;
                    const modality = lead ? meetingModality(lead) : "indefinido";
                    return (
                      <button
                        key={it.id}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setOpen(false);
                          router.push(it.href);
                        }}
                        className="flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/60"
                      >
                        <span className="line-clamp-1 text-[13.5px] font-semibold text-ink">{it.title}</span>
                        <span className="flex items-center gap-1.5 text-[12px] text-brand-700">
                          {it.detail}
                          {g.kind === "reuniao" && modality === "online" && <VideoCamera size={12} weight="fill" />}
                          {g.kind === "reuniao" && modality === "presencial" && <MapPin size={12} weight="fill" />}
                        </span>
                      </button>
                    );
                  })}
                  {g.items.length > 6 && (
                    <div className="px-4 py-1.5 text-[11.5px] text-faint">+{g.items.length - 6} mais</div>
                  )}
                </div>
              );
            })
          )}
          <Link
            href="/"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => setOpen(false)}
            className="sticky bottom-0 block border-t border-border bg-surface-2 px-4 py-2.5 text-center text-[12.5px] font-semibold text-brand hover:underline"
          >
            Abrir o resumo do dia
          </Link>
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut, isAdmin } = useAuth();
  const router = useRouter();
  const { leads } = useLeads();
  const t = useT();

  // Grupos com admin injetado no grupo "Sistema" quando necessario.
  const navGroups: NavGroup[] = useMemo(() => {
    if (!isAdmin) return NAV_GROUPS;
    return NAV_GROUPS.map((g) =>
      g.label === "Sistema"
        ? { ...g, items: [...g.items, { href: "/admin", label: "Admin", Icon: ShieldStar }] }
        : g,
    );
  }, [isAdmin]);

  // Lista achatada derivada dos grupos (inclui admin quando necessario).
  const navItems: NavItem[] = useMemo(() => navGroups.flatMap((g) => g.items), [navGroups]);

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // Quando o usuario viu a fila por ultimo (ms). Leads prontos com updated_at
  // depois disso = "novos chegaram" (sinal cross-pagina apos a busca).
  const [lastSeenFila, setLastSeenFila] = useState<number | null>(null);
  useEffect(() => {
    setMounted(true);
    try {
      setCollapsed(localStorage.getItem("gp-sidebar-collapsed") === "1");
      const seen = Number(localStorage.getItem("fila-last-seen"));
      if (seen) setLastSeenFila(seen);
    } catch {
      /* sem localStorage: fica expandida */
    }
  }, []);
  // Ao entrar na fila, marca como visto agora (zera os "novos").
  useEffect(() => {
    if (!pathname.startsWith("/fila")) return;
    const now = Date.now();
    setLastSeenFila(now);
    try {
      localStorage.setItem("fila-last-seen", String(now));
    } catch {
      /* ignora */
    }
  }, [pathname]);
  const toggleCollapsed = () =>
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem("gp-sidebar-collapsed", next ? "1" : "0");
      } catch {
        /* ignora */
      }
      return next;
    });

  const readyLeads = leads.filter((l) => l.status === "rascunho_pronto" && !l.archived);
  const queue = readyLeads.length;
  // "novos" = prontos que chegaram desde a ultima visita a fila (so fora da fila).
  const onFila = pathname.startsWith("/fila");
  const novos =
    lastSeenFila && !onFila
      ? readyLeads.filter((l) => +new Date(l.updated_at) > lastSeenFila).length
      : 0;
  // Normaliza o pathname para chaves de traducao (ficha/123 -> /ficha, etc.)
  const normPath = pathname.startsWith("/ficha") ? "/ficha" : pathname;
  const [fallbackTitle, fallbackSub] = titleFor(pathname);
  const title = t(`title.${normPath}`, fallbackTitle);
  const sub = t(`sub.${normPath}`, fallbackSub);
  const isDark = mounted && resolvedTheme === "dark";

  // Renderiza um item de navegacao (usado na sidebar e no Sheet de "Mais").
  const renderNavLink = (href: string, label: string, Icon: NavItem["Icon"]) => {
    const active = isActive(pathname, href);
    const badge = href === "/fila" && queue > 0;
    return (
      <Link
        key={href}
        href={href}
        title={collapsed ? label : undefined}
        className={cn(
          "flex items-center gap-3 rounded-xl py-2.5 text-sm font-medium transition-colors",
          collapsed ? "justify-center px-0" : "px-3",
          active
            ? "bg-accent font-bold text-brand"
            : "text-ink-2 hover:bg-accent/60",
        )}
      >
        <span className="relative flex flex-none">
          <Icon size={19} weight={active ? "fill" : "regular"} />
          {badge && collapsed && (
            <span
              className="absolute -right-1.5 -top-1.5 size-2.5 rounded-full ring-2 ring-card"
              style={{ background: "var(--grad)" }}
            />
          )}
        </span>
        {!collapsed && <span className="flex-1">{t(`nav.${href}`, label)}</span>}
        {!collapsed && badge && (
          <span
            className="flex h-[21px] min-w-[21px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white"
            style={{ background: "var(--grad)" }}
          >
            {queue}
          </span>
        )}
      </Link>
    );
  };

  // Sidebar com grupos e rotulos de secao.
  const nav = (extra?: string) => (
    <nav className={cn("flex flex-col gap-0.5", extra)}>
      {navGroups.map((group, gi) => (
        <div key={gi}>
          {group.label && !collapsed && (
            <div className="px-3 pb-1 pt-4 text-[11px] font-bold uppercase tracking-wider text-faint">
              {group.label}
            </div>
          )}
          {group.items.map(({ href, label, Icon }) => renderNavLink(href, label, Icon))}
        </div>
      ))}
    </nav>
  );

  // Bottom-nav mobile: so primarias + botao "Mais".
  const primary = navItems.filter((i) => MOBILE_PRIMARY.includes(i.href));
  const overflow = navItems.filter((i) => !MOBILE_PRIMARY.includes(i.href));

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* sidebar desktop (retratil) */}
      <aside
        className={cn(
          "hidden flex-none flex-col border-r border-border bg-card py-5 transition-[width] duration-200 ease-out lg:flex",
          collapsed ? "w-[76px] px-2.5" : "w-[250px] px-3.5",
        )}
      >
        <div className={cn("flex items-center pb-5.5", collapsed ? "flex-col gap-2.5" : "justify-between px-1")}>
          {!collapsed && (
            <span className="inline-flex items-center gap-2.5">
              <Image src="/4yu-icon.png" alt="4YU CRM" width={38} height={38} priority className="size-8 object-contain" />
              <span className="flex items-baseline gap-[3px] font-heading">
                <span className="text-[19px] font-bold tracking-tight text-foreground">4YU</span>
                <span className="text-[11px] font-semibold tracking-[.14em] text-brand">CRM</span>
              </span>
            </span>
          )}
          <button
            type="button"
            onClick={toggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Retrair menu"}
            title={collapsed ? "Expandir menu" : "Retrair menu"}
            className="flex size-9 flex-none items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            {collapsed ? <CaretRight size={16} weight="bold" /> : <CaretLeft size={16} weight="bold" />}
          </button>
        </div>

        {nav()}

        <div className="mt-auto flex flex-col gap-3">
          {collapsed ? (
            <button
              type="button"
              aria-label="Alternar tema"
              title={`Tema ${isDark ? "escuro" : "claro"}`}
              onClick={() => setTheme(isDark ? "light" : "dark")}
              className="flex size-10 items-center justify-center self-center rounded-xl bg-[var(--inset)] text-brand-600 transition-colors hover:bg-accent"
            >
              {isDark ? <Moon size={16} weight="fill" /> : <Sun size={16} weight="fill" />}
            </button>
          ) : (
            <div className="flex items-center justify-between rounded-xl bg-[var(--inset)] px-2.5 py-2">
              <span className="text-[13px] font-semibold text-muted-foreground">
                Tema {isDark ? "escuro" : "claro"}
              </span>
              <button
                type="button"
                aria-label="Alternar tema"
                onClick={() => setTheme(isDark ? "light" : "dark")}
                className="flex h-[26px] w-[46px] items-center rounded-full p-[3px]"
                style={{ background: "var(--grad)", justifyContent: isDark ? "flex-end" : "flex-start" }}
              >
                <span className="flex size-5 items-center justify-center rounded-full bg-white text-brand-600">
                  {isDark ? <Moon size={12} weight="fill" /> : <Sun size={12} weight="fill" />}
                </span>
              </button>
            </div>
          )}

          {collapsed ? (
            <div className="flex flex-col items-center gap-2">
              <div
                className="flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: "var(--grad)" }}
                title={user?.email ?? "demo"}
              >
                {(user?.email ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <button
                type="button"
                aria-label="Sair"
                onClick={handleSignOut}
                className="flex-none rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
                title="Sair"
              >
                <SignOut size={16} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2.5 py-2">
              <div
                className="flex size-9 flex-none items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: "var(--grad)" }}
              >
                {(user?.email ?? "?").slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold">{user?.email ?? "demo"}</div>
                <div className="text-xs text-faint">Conta ativa</div>
              </div>
              <button
                type="button"
                aria-label="Sair"
                onClick={handleSignOut}
                className="flex-none rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-accent/80 hover:text-foreground"
                title="Sair"
              >
                <SignOut size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-[66px] flex-none items-center justify-between border-b border-border bg-card px-6 sm:px-8">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-tight">{title}</div>
            <div className="truncate text-[12.5px] text-muted-foreground">{sub}</div>
          </div>
          <div className="flex items-center gap-3.5">
            <HeaderSearch leads={leads} t={t} />
            <MobileSearch leads={leads} t={t} />
            <NotificationBell leads={leads} />
            <Link
              href="/fila"
              className={cn(
                "hidden items-center gap-2.5 rounded-full border px-3.5 py-2 transition-colors sm:flex",
                novos > 0
                  ? "border-emerald-300 bg-emerald-50 hover:bg-emerald-100"
                  : "border-border bg-accent hover:bg-accent/70",
              )}
            >
              <span
                className="size-2.5 flex-none rounded-full"
                style={{ background: novos > 0 ? "#10b981" : "var(--brand)", animation: "pulseDot 1.8s ease-in-out infinite" }}
              />
              <span
                className={cn(
                  "hidden text-[13px] font-semibold sm:inline",
                  novos > 0 ? "text-emerald-700" : "text-brand-700",
                )}
              >
                {novos > 0
                  ? novos === 1
                    ? "1 novo lead chegou"
                    : `${novos} novos leads chegaram`
                  : queue > 0
                    ? `${queue} leads prontos pra você`
                    : "Buscando novos leads"}
              </span>
            </Link>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6 pb-24 sm:p-8 lg:pb-8">{children}</main>

        {/* nav mobile (bottom) - apenas primarias + botao Mais */}
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-2 py-1.5 lg:hidden">
          {primary.map(({ href, label, Icon }) => {
            const active = isActive(pathname, href);
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5",
                  active ? "text-brand" : "text-faint",
                )}
              >
                <Icon size={22} weight={active ? "fill" : "regular"} />
                {href === "/fila" && queue > 0 && (
                  <span
                    className="absolute right-1 top-0 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[9px] font-bold text-white"
                    style={{ background: "var(--grad)" }}
                  >
                    {queue}
                  </span>
                )}
              </Link>
            );
          })}

          {overflow.length > 0 && (
            <>
              <button
                type="button"
                aria-label="Mais"
                onClick={() => setMoreOpen(true)}
                className={cn(
                  "relative flex flex-col items-center gap-0.5 rounded-lg px-2 py-1.5",
                  overflow.some((i) => isActive(pathname, i.href)) ? "text-brand" : "text-faint",
                )}
              >
                <DotsThree size={22} weight="bold" />
              </button>

              <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
                <SheetContent side="bottom" showCloseButton={false}>
                  <SheetHeader>
                    <SheetTitle>Mais opções</SheetTitle>
                  </SheetHeader>
                  <nav className="flex flex-col gap-0.5 px-2 pb-4">
                    {overflow.map(({ href, label, Icon }) => {
                      const active = isActive(pathname, href);
                      return (
                        <Link
                          key={href}
                          href={href}
                          onClick={() => setMoreOpen(false)}
                          className={cn(
                            "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors",
                            active ? "bg-accent font-bold text-brand" : "text-ink-2 hover:bg-accent/60",
                          )}
                        >
                          <Icon size={20} weight={active ? "fill" : "regular"} />
                          <span className="flex-1">{t(`nav.${href}`, label)}</span>
                        </Link>
                      );
                    })}
                  </nav>
                </SheetContent>
              </Sheet>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
