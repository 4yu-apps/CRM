// src/app/(app)/admin/page.tsx
"use client";
import { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import {
  ShieldStar,
  Spinner,
  Key,
  EnvelopeSimple,
  Trash,
  X,
  UserCircle,
} from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

interface AdminProfile {
  owner_id: string;
  email: string | null;
  profession: string | null;
  city: string | null;
  state: string | null;
  autopilot: boolean;
  is_admin: boolean;
  leads_count: number;
  last_activity: string | null;
  created_at: string;
}

// Formata datetime ISO para pt-BR compacto: "22/06 14:30"
function fmtDt(iso: string | null): string {
  if (!iso) return "sem atividade";
  const d = new Date(iso);
  const day = String(d.getDate()).padStart(2, "0");
  const month = String(d.getMonth() + 1).padStart(2, "0");
  const hour = String(d.getHours()).padStart(2, "0");
  const min = String(d.getMinutes()).padStart(2, "0");
  return `${day}/${month} ${hour}:${min}`;
}

type ModalType = "password" | "email" | "delete" | null;
interface ModalState {
  type: ModalType;
  profile: AdminProfile;
}

export default function AdminPage() {
  const { isAdmin, session, user } = useAuth();

  const [profiles, setProfiles] = useState<AdminProfile[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [modal, setModal] = useState<ModalState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const [actionBusy, setActionBusy] = useState(false);

  const load = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch("/api/admin/profiles", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: string };
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      const data = (await res.json()) as AdminProfile[];
      setProfiles(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : "Erro ao carregar perfis");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  const openModal = (type: Exclude<ModalType, null>, profile: AdminProfile) => {
    setInputValue("");
    setModal({ type, profile });
  };

  const closeModal = () => {
    if (actionBusy) return;
    setModal(null);
    setInputValue("");
  };

  const doAction = async () => {
    if (!modal || !session?.access_token) return;
    setActionBusy(true);
    try {
      const body: Record<string, unknown> = {
        action:
          modal.type === "password"
            ? "update_password"
            : modal.type === "email"
              ? "update_email"
              : "delete",
        ownerId: modal.profile.owner_id,
      };
      if (modal.type === "password") body.password = inputValue;
      if (modal.type === "email") body.email = inputValue;

      const res = await fetch("/api/admin/user", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(body),
      });
      const j = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || !j.ok) throw new Error(j.error ?? `HTTP ${res.status}`);

      const msgs: Record<string, string> = {
        password: "Senha alterada",
        email: "E-mail atualizado",
        delete: "Perfil excluido",
      };
      toast.success(msgs[modal.type ?? "delete"]);
      setModal(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro na operacao");
    } finally {
      setActionBusy(false);
    }
  };

  // Gate: se nao for admin, nao mostra nada sensivel.
  if (!isAdmin) {
    return (
      <div className="mx-auto flex max-w-[600px] flex-col items-center gap-4 py-24 text-center">
        <ShieldStar size={40} className="text-faint" />
        <div className="text-[17px] font-bold text-ink">Sem acesso</div>
        <p className="text-[14px] text-muted-foreground">
          Esta area e restrita a administradores do sistema.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1200px]">
      {/* Cabecalho */}
      <div className="mb-6 flex items-center gap-3">
        <ShieldStar size={28} weight="fill" className="text-brand" />
        <div>
          <div className="text-[20px] font-bold text-ink">Admin</div>
          <div className="text-[13px] text-faint">
            Gerencie todos os perfis do sistema
          </div>
        </div>
        {!loading && profiles.length > 0 && (
          <span className="ml-auto rounded-full border border-border bg-accent px-3 py-1 text-[13px] font-semibold text-ink-2">
            {profiles.length} {profiles.length === 1 ? "perfil" : "perfis"}
          </span>
        )}
      </div>

      {/* Estado de loading */}
      {loading && (
        <div className="flex items-center justify-center py-24">
          <Spinner size={28} className="animate-spin text-brand" />
        </div>
      )}

      {/* Erro de carregamento */}
      {!loading && loadError && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-5 py-4 text-[14px] text-rose-700">
          Erro ao carregar: {loadError}
          <button
            type="button"
            onClick={() => void load()}
            className="ml-3 underline"
          >
            Tentar de novo
          </button>
        </div>
      )}

      {/* Tabela */}
      {!loading && !loadError && profiles.length > 0 && (
        <div className="overflow-hidden rounded-[16px] border border-border bg-card shadow-[var(--shadow)]">
          {/* Cabecalho da tabela (desktop) */}
          <div className="hidden grid-cols-[2fr_1.2fr_1fr_0.6fr_1.2fr_0.5fr_0.5fr_auto] gap-3 border-b border-border bg-surface-2 px-5 py-3 text-[11.5px] font-bold uppercase tracking-wider text-faint lg:grid lg:items-center">
            <span>E-mail</span>
            <span>Area</span>
            <span>Local</span>
            <span>Leads</span>
            <span>Ultima atividade</span>
            <span>Piloto</span>
            <span>Admin</span>
            <span className="text-right">Acoes</span>
          </div>

          <div className="divide-y divide-border">
            {profiles.map((p) => {
              const isSelf = p.owner_id === user?.id;
              return (
                <div
                  key={p.owner_id}
                  className={cn(
                    "grid grid-cols-1 gap-2 px-5 py-3.5 text-[13.5px] transition-colors lg:grid-cols-[2fr_1.2fr_1fr_0.6fr_1.2fr_0.5fr_0.5fr_auto] lg:items-center lg:gap-3",
                    isSelf ? "bg-brand-50/60" : "hover:bg-accent/30",
                  )}
                >
                  {/* E-mail */}
                  <div className="flex min-w-0 items-center gap-2">
                    <UserCircle size={18} className="flex-none text-faint" />
                    <span className="truncate font-medium text-ink">
                      {p.email ?? "(sem e-mail)"}
                      {isSelf && (
                        <span className="ml-2 text-[11px] font-semibold text-brand">
                          (voce)
                        </span>
                      )}
                    </span>
                  </div>

                  {/* Area (profession) */}
                  <div className="truncate text-ink-2">
                    {p.profession ?? <span className="text-faint">-</span>}
                  </div>

                  {/* Local */}
                  <div className="truncate text-ink-2">
                    {[p.city, p.state].filter(Boolean).join(" / ") || (
                      <span className="text-faint">-</span>
                    )}
                  </div>

                  {/* Leads */}
                  <div className="font-semibold text-ink">{p.leads_count}</div>

                  {/* Ultima atividade */}
                  <div
                    className={cn(
                      "text-[12.5px]",
                      p.last_activity ? "text-ink-2" : "text-faint",
                    )}
                  >
                    {fmtDt(p.last_activity)}
                  </div>

                  {/* Piloto */}
                  <div>
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold",
                        p.autopilot
                          ? "bg-emerald-100 text-emerald-700"
                          : "bg-zinc-100 text-zinc-500",
                      )}
                    >
                      {p.autopilot ? "on" : "off"}
                    </span>
                  </div>

                  {/* Admin badge */}
                  <div>
                    {p.is_admin && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-brand/10 px-2 py-0.5 text-[11px] font-semibold text-brand">
                        <ShieldStar size={11} weight="fill" />
                        admin
                      </span>
                    )}
                  </div>

                  {/* Acoes */}
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      title="Trocar senha"
                      onClick={() => openModal("password", p)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-ink"
                    >
                      <Key size={16} />
                    </button>
                    <button
                      type="button"
                      title="Trocar e-mail"
                      onClick={() => openModal("email", p)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-ink"
                    >
                      <EnvelopeSimple size={16} />
                    </button>
                    <button
                      type="button"
                      title={isSelf ? "Nao e possivel excluir a propria conta" : "Excluir perfil"}
                      disabled={isSelf}
                      onClick={() => !isSelf && openModal("delete", p)}
                      className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-rose-500/10 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash size={16} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Vazio */}
      {!loading && !loadError && profiles.length === 0 && (
        <div className="flex flex-col items-center gap-3 py-24 text-center">
          <ShieldStar size={36} className="text-faint" />
          <div className="text-[15px] font-semibold text-ink">Nenhum perfil encontrado</div>
        </div>
      )}

      {/* Modal: Trocar senha */}
      {modal?.type === "password" && (
        <ModalWrapper title="Trocar senha" onClose={closeModal}>
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            Nova senha para <strong className="text-ink">{modal.profile.email ?? modal.profile.owner_id}</strong>.
          </p>
          <input
            type="password"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Nova senha (minimo 6 caracteres)"
            className="mb-5 w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3 text-[14px] text-ink outline-none focus:border-brand"
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={actionBusy || inputValue.length < 6}
              onClick={() => void doAction()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-brand p-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {actionBusy ? <Spinner size={16} className="animate-spin" /> : <Key size={16} />}
              {actionBusy ? "Salvando..." : "Salvar senha"}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={actionBusy}
              className="rounded-[13px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </ModalWrapper>
      )}

      {/* Modal: Trocar e-mail */}
      {modal?.type === "email" && (
        <ModalWrapper title="Trocar e-mail" onClose={closeModal}>
          <p className="mb-4 text-[13.5px] text-muted-foreground">
            Novo e-mail para <strong className="text-ink">{modal.profile.email ?? modal.profile.owner_id}</strong>.
          </p>
          <input
            type="email"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="novo@email.com"
            className="mb-5 w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3 text-[14px] text-ink outline-none focus:border-brand"
          />
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={actionBusy || !inputValue.includes("@")}
              onClick={() => void doAction()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-brand p-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {actionBusy ? <Spinner size={16} className="animate-spin" /> : <EnvelopeSimple size={16} />}
              {actionBusy ? "Salvando..." : "Salvar e-mail"}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={actionBusy}
              className="rounded-[13px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </ModalWrapper>
      )}

      {/* Modal: Excluir perfil */}
      {modal?.type === "delete" && (
        <ModalWrapper title="Excluir perfil?" onClose={closeModal}>
          <p className="mb-5 text-[13.5px] text-muted-foreground">
            Voce esta prestes a excluir <strong className="text-ink">{modal.profile.email ?? modal.profile.owner_id}</strong>.
            Isso apaga permanentemente <strong className="text-ink">todos os leads</strong>, o log de
            atividade, a cobertura de varredura e o perfil de configuracao do usuario. A conta de
            acesso tambem sera removida. Esta acao nao tem desfazer.
          </p>
          <div className="flex gap-2.5">
            <button
              type="button"
              disabled={actionBusy}
              onClick={() => void doAction()}
              className="flex flex-1 items-center justify-center gap-2 rounded-[13px] bg-rose-600 p-3 text-sm font-bold text-white disabled:opacity-60"
            >
              {actionBusy ? <Spinner size={16} className="animate-spin" /> : <Trash size={16} />}
              {actionBusy ? "Excluindo..." : "Excluir de vez"}
            </button>
            <button
              type="button"
              onClick={closeModal}
              disabled={actionBusy}
              className="rounded-[13px] border border-border-2 bg-card px-5 py-3 text-sm font-semibold text-ink-2 disabled:opacity-60"
            >
              Cancelar
            </button>
          </div>
        </ModalWrapper>
      )}
    </div>
  );
}

// Wrapper de modal reutilizavel (local, nao precisa de arquivo separado).
function ModalWrapper({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[420px] rounded-[18px] border border-border bg-card p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div className="text-[16px] font-bold text-ink">{title}</div>
          <button
            type="button"
            onClick={onClose}
            className="text-faint hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
