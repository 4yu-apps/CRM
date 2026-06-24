// src/app/(app)/admin/logs/page.tsx
// Superadmin: logs da esteira (busca/enriquecimento/descarte/rascunho) de TODOS
// os usuarios, pra debugar o que o robo fez por dono (ex.: latencia de busca).
"use client";
import { useState, useEffect, useRef, useMemo } from "react";
import {
  ShieldStar,
  Spinner,
  ArrowClockwise,
  ArrowLeft,
  UserCircle,
  MagnifyingGlass,
  ScanSmiley,
  Trash,
  NotePencil,
  Footprints,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface ActivityRow {
  id: string;
  owner_id: string;
  email: string | null;
  tipo: string;
  text: string;
  ref_count: number | null;
  created_at: string;
}

const TIPO_META: Record<
  string,
  { label: string; Icon: React.ComponentType<{ size: number; className?: string }>; cls: string }
> = {
  busca: { label: "busca", Icon: MagnifyingGlass, cls: "bg-brand/10 text-brand" },
  enriquecimento: { label: "enriquecimento", Icon: ScanSmiley, cls: "bg-sky-100 text-sky-700" },
  descarte: { label: "descarte", Icon: Trash, cls: "bg-zinc-100 text-zinc-500" },
  rascunho: { label: "rascunho", Icon: NotePencil, cls: "bg-emerald-100 text-emerald-700" },
  varredura: { label: "varredura", Icon: Footprints, cls: "bg-amber-100 text-amber-700" },
};

// "22/06 14:30:07" — com segundos, que aqui o que importa e a latencia.
function fmtDt(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

export default function AdminLogsPage() {
  const { isAdmin, session } = useAuth();

  const [rows, setRows] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ownerFilter, setOwnerFilter] = useState("");
  const [tipoFilter, setTipoFilter] = useState("");

  const loadRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    if (!isAdmin || !session?.access_token) return;
    const token = session.access_token;

    const fetchLogs = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const res = await fetch("/api/admin/activity", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          const j = (await res.json()) as { error?: string };
          throw new Error(j.error ?? `HTTP ${res.status}`);
        }
        setRows((await res.json()) as ActivityRow[]);
      } catch (e) {
        setLoadError(e instanceof Error ? e.message : "Erro ao carregar logs");
      } finally {
        setLoading(false);
      }
    };

    loadRef.current = fetchLogs;
    void fetchLogs();
  }, [isAdmin, session?.access_token]);

  // donos presentes nos eventos, pro filtro (rotulados por e-mail).
  const owners = useMemo(() => {
    const m = new Map<string, string>();
    for (const r of rows) m.set(r.owner_id, r.email ?? r.owner_id);
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [rows]);

  const filtered = useMemo(
    () =>
      rows.filter(
        (r) =>
          (!ownerFilter || r.owner_id === ownerFilter) &&
          (!tipoFilter || r.tipo === tipoFilter),
      ),
    [rows, ownerFilter, tipoFilter],
  );

  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-[600px] flex-col items-center gap-4 py-24 text-center">
        <ShieldStar size={40} className="text-faint" />
        <div className="text-[17px] font-bold text-ink">Sem acesso</div>
        <p className="text-[14px] text-muted-foreground">
          Esta área é restrita a administradores do sistema.
        </p>
      </div>
    );
  }

  const selectCls =
    "rounded-[12px] border border-border-2 bg-surface-2 px-3 py-2 text-[13px] text-ink outline-none focus:border-brand";

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Cabecalho */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <ShieldStar size={28} weight="fill" className="text-brand" />
        <div>
          <div className="text-[20px] font-bold text-ink">Logs da esteira</div>
          <div className="text-[13px] text-faint">
            O que o robô fez por usuário (últimos 300 eventos)
          </div>
        </div>
        <Link
          href="/admin"
          className="ml-auto flex items-center gap-1.5 rounded-[12px] border border-border-2 bg-card px-3 py-2 text-[13px] font-semibold text-ink-2 hover:bg-accent"
        >
          <ArrowLeft size={15} /> Perfis
        </Link>
        <button
          type="button"
          onClick={() => void loadRef.current?.()}
          disabled={loading}
          className="flex items-center gap-1.5 rounded-[12px] bg-brand px-3 py-2 text-[13px] font-bold text-white disabled:opacity-60"
        >
          {loading ? (
            <Spinner size={15} className="animate-spin" />
          ) : (
            <ArrowClockwise size={15} />
          )}
          Atualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <select
          value={ownerFilter}
          onChange={(e) => setOwnerFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos os usuários</option>
          {owners.map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        <select
          value={tipoFilter}
          onChange={(e) => setTipoFilter(e.target.value)}
          className={selectCls}
        >
          <option value="">Todos os tipos</option>
          {Object.keys(TIPO_META).map((t) => (
            <option key={t} value={t}>
              {TIPO_META[t].label}
            </option>
          ))}
        </select>
        {!loading && (
          <span className="ml-auto rounded-full border border-border bg-accent px-3 py-1 text-[13px] font-semibold text-ink-2">
            {filtered.length} {filtered.length === 1 ? "evento" : "eventos"}
          </span>
        )}
      </div>

      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner size={28} className="animate-spin text-brand" />
        </div>
      )}

      {!loading && loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[14px] text-rose-700">
          Erro ao carregar: {loadError}
          <button
            type="button"
            onClick={() => void loadRef.current?.()}
            className="ml-3 underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {!loading && !loadError && filtered.length > 0 && (
        <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--shadow)]">
          <div className="hidden grid-cols-[150px_2fr_1.1fr_4fr_0.6fr] gap-3 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wider text-faint lg:grid lg:items-center">
            <span>Quando</span>
            <span>Usuário</span>
            <span>Tipo</span>
            <span>O que fez</span>
            <span className="text-right">Qtd</span>
          </div>

          <div className="divide-y divide-border">
            {filtered.map((r) => {
              const meta = TIPO_META[r.tipo] ?? {
                label: r.tipo,
                Icon: Footprints,
                cls: "bg-zinc-100 text-zinc-500",
              };
              const Icon = meta.Icon;
              return (
                <div
                  key={r.id}
                  className="grid grid-cols-1 gap-1.5 px-5 py-3 text-[13.5px] transition-colors hover:bg-accent/30 lg:grid-cols-[150px_2fr_1.1fr_4fr_0.6fr] lg:items-center lg:gap-3"
                >
                  <div className="font-mono text-[12.5px] text-ink-2">{fmtDt(r.created_at)}</div>
                  <div className="flex min-w-0 items-center gap-2">
                    <UserCircle size={18} className="flex-none text-faint" />
                    <span className="truncate text-ink">{r.email ?? r.owner_id}</span>
                  </div>
                  <div>
                    <span
                      className={cn(
                        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        meta.cls,
                      )}
                    >
                      <Icon size={11} />
                      {meta.label}
                    </span>
                  </div>
                  <div className="truncate text-ink-2">{r.text}</div>
                  <div className="text-right font-semibold text-ink">
                    {r.ref_count ?? <span className="text-faint">-</span>}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {!loading && !loadError && filtered.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <Footprints size={36} className="text-faint" />
          <div className="text-[15px] font-semibold text-ink">Nenhum evento</div>
        </div>
      )}
    </div>
  );
}
