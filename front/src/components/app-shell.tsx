"use client";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import {
  House,
  Tray,
  Funnel,
  AddressBook,
  ChartLineUp,
  MagnifyingGlass,
  DeviceMobile,
  GearSix,
  Sun,
  Moon,
  SignOut,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { useLeads } from "@/hooks/use-leads";
import { STATUS_META } from "@/lib/state-machine";
import type { Lead } from "@/lib/types";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; Icon: typeof House };

const NAV: NavItem[] = [
  { href: "/", label: "Início", Icon: House },
  { href: "/fila", label: "Fila de leads", Icon: Tray },
  { href: "/funil", label: "Funil", Icon: Funnel },
  { href: "/contatos", label: "Contatos", Icon: AddressBook },
  { href: "/resultados", label: "Resultados", Icon: ChartLineUp },
  { href: "/buscar", label: "Buscar", Icon: MagnifyingGlass },
  { href: "/celular", label: "No celular", Icon: DeviceMobile },
  { href: "/config", label: "Configuração", Icon: GearSix },
];

const TITLES: Record<string, [string, string]> = {
  "/": ["Visão geral", "Seu ponto de partida do dia"],
  "/fila": ["Fila de leads", "Revise, ajuste e aprove"],
  "/funil": ["Funil", "Onde cada lead está agora"],
  "/contatos": ["Contatos", "Sua base inteira, num lugar só"],
  "/resultados": ["Resultados", "Tá valendo a pena?"],
  "/buscar": ["Buscar leads", "Sob comando, quando você quiser"],
  "/celular": ["No celular", "Acompanhe e envie pelo WhatsApp"],
  "/config": ["Configuração", "Ajuste uma vez, eu cuido do resto"],
  "/ficha": ["Ficha do lead", "Tudo que eu juntei sobre o negócio"],
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

// Busca rapida no cabecalho: acha um contato por nome/cidade/telefone e abre a
// ficha na hora. Atalho pra quando voce so quer pular pra um lead especifico.
function HeaderSearch({ leads }: { leads: Lead[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const matches =
    q.trim().length < 2
      ? []
      : (() => {
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
        })();

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
        placeholder="Buscar contato..."
        className="w-[200px] rounded-full border border-border bg-accent py-2 pl-9 pr-3 text-[13px] text-ink outline-none transition-all focus:w-[260px] focus:border-brand"
      />
      {open && q.trim().length >= 2 && (
        <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[300px] overflow-hidden rounded-[14px] border border-border bg-card shadow-xl">
          {matches.length === 0 ? (
            <div className="px-4 py-3 text-[13px] text-muted-foreground">Nada encontrado</div>
          ) : (
            matches.map((l) => (
              <button
                key={l.id}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => go(l.id)}
                className="flex w-full flex-col items-start gap-0.5 border-b border-border px-4 py-2.5 text-left transition-colors last:border-0 hover:bg-accent/60"
              >
                <span className="truncate text-[13.5px] font-semibold text-ink">
                  {l.business_name ?? "(sem nome)"}
                </span>
                <span className="truncate text-[12px] text-faint">
                  {[l.city, l.state].filter(Boolean).join(" / ") || STATUS_META[l.status].label}
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, signOut } = useAuth();
  const router = useRouter();
  const { leads } = useLeads();

  const handleSignOut = async () => {
    await signOut();
    router.replace("/login");
  };
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const queue = leads.filter((l) => l.status === "rascunho_pronto").length;
  const [title, sub] = titleFor(pathname);
  const isDark = mounted && resolvedTheme === "dark";

  const nav = (extra?: string) => (
    <nav className={cn("flex flex-col gap-0.5", extra)}>
      {NAV.map(({ href, label, Icon }) => {
        const active = isActive(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors",
              active
                ? "bg-accent font-bold text-brand"
                : "text-ink-2 hover:bg-accent/60",
            )}
          >
            <Icon size={19} weight={active ? "fill" : "regular"} />
            <span className="flex-1">{label}</span>
            {href === "/fila" && queue > 0 && (
              <span
                className="flex h-[21px] min-w-[21px] items-center justify-center rounded-full px-1.5 text-[11.5px] font-bold text-white"
                style={{ background: "var(--grad)" }}
              >
                {queue}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="flex h-screen w-full overflow-hidden bg-background text-foreground">
      {/* sidebar desktop */}
      <aside className="hidden w-[250px] flex-none flex-col border-r border-border bg-card px-3.5 py-5 lg:flex">
        <div className="px-1 pb-5.5">
          <span className="inline-flex items-center rounded-xl bg-zinc-950 px-3 py-2 shadow-sm">
            <Image src="/logo.png" alt="4YUmkt" width={1080} height={419} priority className="h-7 w-auto" />
          </span>
        </div>

        {nav()}

        <div className="mt-auto flex flex-col gap-3">
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
        </div>
      </aside>

      <div className="flex h-full min-w-0 flex-1 flex-col">
        <header className="flex h-[66px] flex-none items-center justify-between border-b border-border bg-card px-6 sm:px-8">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold tracking-tight">{title}</div>
            <div className="truncate text-[12.5px] text-muted-foreground">{sub}</div>
          </div>
          <div className="flex items-center gap-3.5">
            <HeaderSearch leads={leads} />
            <div className="flex items-center gap-2.5 rounded-full border border-border bg-accent px-3.5 py-2">
              <span
                className="size-2.5 flex-none rounded-full"
                style={{ background: "var(--brand)", animation: "pulseDot 1.8s ease-in-out infinite" }}
              />
              <span className="hidden text-[13px] font-semibold text-brand-700 sm:inline">
                {queue > 0 ? `${queue} leads prontos pra você` : "Buscando novos leads"}
              </span>
            </div>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto p-6 pb-24 sm:p-8 lg:pb-8">{children}</main>

        {/* nav mobile (bottom) */}
        <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-around border-t border-border bg-card px-2 py-1.5 lg:hidden">
          {NAV.map(({ href, label, Icon }) => {
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
        </div>
      </div>
    </div>
  );
}
