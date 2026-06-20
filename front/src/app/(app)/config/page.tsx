"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Calendar,
  Check,
  DownloadSimple,
  GearSix,
  GoogleLogo,
  Info,
  MapPin,
  Plus,
  PuzzlePiece,
  Robot,
  Storefront,
  Tag,
  X,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { SERVICE_META } from "@/lib/service";
import { useAuth } from "@/lib/auth";
import { fetchEstados, fetchMunicipios, type Municipio, type UF } from "@/lib/ibge";
import type { SearchProfile, SearchProfileInput, ServiceTarget } from "@/lib/types";
import { cn } from "@/lib/utils";

// Ramos sugeridos como ponto de partida
const RAMOS_SUGERIDOS = [
  "Hamburgueria",
  "Barbearia",
  "Petshop",
  "Restaurante",
  "Academia",
  "Clinica odontologica",
  "Cafeteria",
  "Estetica",
  "Pilates",
  "Papelaria",
];

const RAIOS: { value: string; label: string }[] = [
  { value: "5km", label: "Ate 5 km" },
  { value: "10km", label: "Ate 10 km" },
  { value: "25km", label: "Ate 25 km" },
  { value: "50km", label: "Ate 50 km" },
  { value: "cidade", label: "Cidade toda" },
];

const SERVICOS: { value: ServiceTarget; label: string }[] = [
  { value: "trafego", label: SERVICE_META.trafego.label },
  { value: "automacao", label: SERVICE_META.automacao.label },
  { value: "ambos", label: SERVICE_META.ambos.label },
];

// ---------------------------------------------------------------------------
// Toggle simples sem dependencia de lib
// ---------------------------------------------------------------------------
function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className={cn(
        "relative flex h-[30px] w-[52px] flex-none cursor-pointer items-center rounded-full border-none transition-colors duration-200",
        on ? "bg-brand" : "bg-[var(--inset)]",
      )}
    >
      <span
        className={cn(
          "absolute h-[24px] w-[24px] rounded-full bg-white shadow-[0_1px_3px_rgba(0,0,0,.25)] transition-transform duration-200",
          on ? "translate-x-[25px]" : "translate-x-[3px]",
        )}
      />
    </button>
  );
}

// ---------------------------------------------------------------------------
// Secao do formulario
// ---------------------------------------------------------------------------
function Section({ title, sub, icon, children }: {
  title: string;
  sub?: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
      <div className="border-b border-border px-6 py-5">
        <div className="flex items-center gap-3">
          <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-brand-50 text-brand">
            {icon}
          </div>
          <div>
            <div className="text-[15px] font-bold">{title}</div>
            {sub && <div className="mt-0.5 text-[13px] text-muted-foreground">{sub}</div>}
          </div>
        </div>
      </div>
      <div className="p-6">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Pagina principal
// ---------------------------------------------------------------------------
export default function ConfigPage() {
  const repo = getRepo();
  const { signInWithGoogle, mode, refreshProfile } = useAuth();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isOnboarding, setIsOnboarding] = useState(false);
  const [connectingGoogle, setConnectingGoogle] = useState(false);
  const [googleError, setGoogleError] = useState<string | null>(null);

  // Campos do perfil
  const [niches, setNiches] = useState<string[]>([]);
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [radius, setRadius] = useState("cidade");
  const [serviceTarget, setServiceTarget] = useState<ServiceTarget>("indefinido");
  const [autopilot, setAutopilot] = useState(false);

  // Listas vindas do IBGE para os selects em cascata (estado -> cidade)
  const [estados, setEstados] = useState<UF[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);

  // Input de ramo personalizado
  const [nicheInput, setNicheInput] = useState("");
  const nicheRef = useRef<HTMLInputElement>(null);

  // Carregar perfil existente
  useEffect(() => {
    void (async () => {
      try {
        const profile: SearchProfile | null = await repo.getProfile();
        if (!profile) {
          setIsOnboarding(true);
        } else {
          setNiches(profile.niches ?? []);
          setCity(profile.city ?? "");
          setState(profile.state ?? "");
          setRadius(profile.radius ?? "cidade");
          setServiceTarget(profile.default_service_target ?? "indefinido");
          setAutopilot(profile.autopilot ?? false);
        }
      } catch {
        // Se falhar, trata como primeiro acesso
        setIsOnboarding(true);
      } finally {
        setLoading(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Carrega a lista de estados do IBGE uma vez, ao montar.
  useEffect(() => {
    fetchEstados().then(setEstados).catch(() => null);
  }, []);

  // Carrega as cidades sempre que a UF muda. UF vazia limpa a lista.
  // O setState sincrono aqui apenas zera a lista quando nao ha estado, fluxo
  // de sincronizacao com a selecao do usuario, por isso o disable abaixo.
  useEffect(() => {
    if (!state) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMunicipios([]);
      return;
    }
    let ativo = true;
    setLoadingCidades(true);
    fetchMunicipios(state)
      .then((lista) => {
        if (ativo) setMunicipios(lista);
      })
      .catch(() => {
        if (ativo) setMunicipios([]);
      })
      .finally(() => {
        if (ativo) setLoadingCidades(false);
      });
    return () => {
      ativo = false;
    };
  }, [state]);

  // Troca de estado: recarrega cidades (efeito acima) e limpa a cidade escolhida.
  const handleStateChange = useCallback((novaUf: string) => {
    setState(novaUf);
    setCity("");
  }, []);

  // Adicionar ramo
  const addNiche = useCallback((ramo: string) => {
    const trimmed = ramo.trim();
    if (!trimmed) return;
    setNiches((prev) => {
      if (prev.map((n) => n.toLowerCase()).includes(trimmed.toLowerCase())) return prev;
      return [...prev, trimmed];
    });
  }, []);

  const removeNiche = useCallback((ramo: string) => {
    setNiches((prev) => prev.filter((n) => n !== ramo));
  }, []);

  const handleNicheInputKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      addNiche(nicheInput);
      setNicheInput("");
    }
  };

  // Salvar
  const save = useCallback(async () => {
    setSaving(true);
    try {
      const input: SearchProfileInput = {
        niches,
        city: city.trim() || null,
        state: state.trim() || null,
        radius,
        default_service_target: serviceTarget,
        autopilot,
      };
      await repo.saveProfile(input);
      // Libera o gate de onboarding (fonte unica no contexto de auth).
      await refreshProfile();
      const wasOnboarding = isOnboarding;
      setIsOnboarding(false);
      toast.success("Tudo salvo. Ja estou rodando pra voce.");
      // No primeiro acesso, manda pro Inicio depois de salvar o perfil.
      if (wasOnboarding) router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }, [niches, city, state, radius, serviceTarget, autopilot, repo, refreshProfile, isOnboarding, router]);

  // Conectar Google Calendar
  const connectGoogle = useCallback(async () => {
    setConnectingGoogle(true);
    setGoogleError(null);
    try {
      await signInWithGoogle();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Degrada com graca se o provider nao estiver habilitado no Supabase
      if (
        msg.toLowerCase().includes("provider") ||
        msg.toLowerCase().includes("not enabled") ||
        msg.toLowerCase().includes("disabled")
      ) {
        setGoogleError(
          "O login com Google ainda nao esta habilitado nesta instalacao. Peca ao administrador ativar o provider Google no painel do Supabase.",
        );
      } else {
        setGoogleError(msg);
      }
    } finally {
      setConnectingGoogle(false);
    }
  }, [signInWithGoogle]);

  // ---------------------------------------------------------------------------
  // Loading
  // ---------------------------------------------------------------------------
  if (loading) {
    return (
      <div className="mx-auto max-w-[760px]">
        <div className="mt-20 flex flex-col items-center gap-4 text-center text-muted-foreground">
          <div className="size-8 animate-spin rounded-full border-2 border-brand border-t-transparent" />
          <span className="text-sm">Carregando configuracoes...</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <div className="mx-auto max-w-[760px]">
      {/* Cabecalho da pagina */}
      <div className="mb-6">
        <div className="flex items-center gap-3">
          <div className="flex size-11 items-center justify-center rounded-[14px] bg-brand-50 text-brand">
            <GearSix size={24} weight="duotone" />
          </div>
          <div>
            <h1 className="font-heading text-2xl font-bold tracking-tight">Configuracao</h1>
            {isOnboarding ? (
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                Primeira vez aqui. Escolhe os ramos, confirma a cidade e pronto. Pode ajustar a qualquer hora.
              </p>
            ) : (
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                Voce ajusta isso uma vez. Depois eu trabalho sozinho no dia a dia.
              </p>
            )}
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* ------------------------------------------------------------------ */}
        {/* 1. Ramos */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Ramos que voce atende"
          sub="Vou priorizar esses tipos de negocio na busca automatica."
          icon={<Storefront size={20} />}
        >
          {/* Chips selecionados */}
          {niches.length > 0 && (
            <div className="mb-4 flex flex-wrap gap-2">
              {niches.map((n) => (
                <span
                  key={n}
                  className="flex items-center gap-1.5 rounded-full bg-brand-50 px-3 py-1.5 text-[13px] font-semibold text-brand"
                >
                  {n}
                  <button
                    type="button"
                    onClick={() => removeNiche(n)}
                    className="flex items-center opacity-60 hover:opacity-100"
                    aria-label={`Remover ${n}`}
                  >
                    <X size={13} weight="bold" />
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Campo para adicionar ramo personalizado */}
          <div className="mb-4 flex gap-2">
            <div className="relative flex-1">
              <Tag size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-faint" />
              <input
                ref={nicheRef}
                value={nicheInput}
                onChange={(e) => setNicheInput(e.target.value)}
                onKeyDown={handleNicheInputKey}
                placeholder="Digite um ramo e pressione Enter"
                className="w-full rounded-xl border border-border-2 bg-surface-2 py-2.5 pl-10 pr-3.5 text-sm outline-none focus:border-brand"
              />
            </div>
            <button
              type="button"
              onClick={() => { addNiche(nicheInput); setNicheInput(""); }}
              disabled={!nicheInput.trim()}
              className="flex items-center gap-1.5 rounded-xl border border-border-2 bg-card px-4 py-2.5 text-sm font-semibold text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-40"
            >
              <Plus size={15} weight="bold" /> Adicionar
            </button>
          </div>

          {/* Sugestoes rapidas */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Sugestoes rapidas</div>
            <div className="flex flex-wrap gap-2">
              {RAMOS_SUGERIDOS.filter((r) => !niches.map((n) => n.toLowerCase()).includes(r.toLowerCase())).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => addNiche(r)}
                  className="rounded-full border border-border-2 bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
                >
                  + {r}
                </button>
              ))}
              {RAMOS_SUGERIDOS.filter((r) => !niches.map((n) => n.toLowerCase()).includes(r.toLowerCase())).length === 0 && (
                <span className="text-[13px] text-faint">Voce ja selecionou todos os sugeridos.</span>
              )}
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 2. Onde buscar */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Onde buscar"
          sub="Defina a regiao principal. Posso buscar mais largo se quiser."
          icon={<MapPin size={20} />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Estado (UF) */}
            <div>
              <label
                htmlFor="config-estado"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint"
              >
                Estado
              </label>
              <select
                id="config-estado"
                value={state}
                onChange={(e) => handleStateChange(e.target.value)}
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              >
                <option value="">Escolha o estado</option>
                {estados.map((uf) => (
                  <option key={uf.id} value={uf.sigla}>
                    {uf.nome} ({uf.sigla})
                  </option>
                ))}
              </select>
            </div>

            {/* Cidade base (cascata a partir do estado) */}
            <div>
              <label
                htmlFor="config-cidade"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint"
              >
                Cidade base
              </label>
              <select
                id="config-cidade"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!state || loadingCidades}
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-brand disabled:opacity-60"
              >
                <option value="">
                  {!state
                    ? "Escolha o estado antes"
                    : loadingCidades
                      ? "Carregando cidades..."
                      : "Escolha a cidade"}
                </option>
                {municipios.map((m) => (
                  <option key={m.id} value={m.nome}>
                    {m.nome}
                  </option>
                ))}
              </select>
            </div>

            {/* Raio */}
            <div>
              <label
                htmlFor="config-raio"
                className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint"
              >
                Raio de atuacao
              </label>
              <select
                id="config-raio"
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-3.5 py-2.5 text-sm outline-none focus:border-brand"
              >
                {RAIOS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 3. Servico padrao */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Servico padrao"
          sub="Qual servico voce oferece na maioria dos contatos? Uso como filtro ao pontuar os leads."
          icon={<Tag size={20} />}
        >
          <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
            {SERVICOS.map((s) => {
              const meta = SERVICE_META[s.value];
              const selected = serviceTarget === s.value;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => setServiceTarget(s.value)}
                  className={cn(
                    "flex flex-1 items-center gap-3 rounded-[14px] border px-4 py-3.5 text-left transition-colors",
                    selected
                      ? "border-brand bg-brand-50"
                      : "border-border-2 bg-surface-2 hover:border-brand/40 hover:bg-brand-50/50",
                  )}
                >
                  <div
                    className={cn(
                      "flex size-5 flex-none items-center justify-center rounded-full border-2 transition-colors",
                      selected ? "border-brand bg-brand" : "border-border-2 bg-card",
                    )}
                  >
                    {selected && <Check size={11} weight="bold" className="text-white" />}
                  </div>
                  <div>
                    <div className={cn("text-[13.5px] font-bold", selected ? "text-brand" : "text-ink")}>
                      {s.label}
                    </div>
                    <span className={cn("inline-block rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", meta.badge)}>
                      {meta.short}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 4. Piloto automatico */}
        {/* ------------------------------------------------------------------ */}
        <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-brand-50 text-brand">
                <Robot size={20} />
              </div>
              <div>
                <div className="text-[15px] font-bold">Busca no piloto automatico</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  Eu cubro o mapa em ordem e encho a fila sem voce precisar pedir.
                </div>
              </div>
            </div>
            <Toggle on={autopilot} onChange={setAutopilot} />
          </div>
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 5. Extensao Chrome */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Extensao Chrome"
          sub="Uma extensao so. Ela aparece no Google Maps para capturar e no WhatsApp Web para atualizar o funil."
          icon={<PuzzlePiece size={20} />}
        >
          <div className="rounded-[16px] border border-brand/20 bg-brand-50/70 p-4">
            <div className="mb-4 text-[13.5px] leading-relaxed text-ink-2">
              Baixe o arquivo, descompacte a pasta e carregue no Chrome em modo desenvolvedor.
              Depois abra o Google Maps ou o WhatsApp Web. O painel aparece sozinho quando estiver no lugar certo.
            </div>

            <div className="grid gap-3 text-[13px] text-ink-2 sm:grid-cols-3">
              {[
                ["1", "Baixar e descompactar"],
                ["2", "Abrir chrome://extensions"],
                ["3", "Carregar a pasta"],
              ].map(([n, text]) => (
                <div key={n} className="flex gap-2 rounded-[13px] border border-border bg-card p-3">
                  <span className="flex size-6 flex-none items-center justify-center rounded-full bg-brand text-[11px] font-bold text-white">
                    {n}
                  </span>
                  <span className="font-semibold leading-snug">{text}</span>
                </div>
              ))}
            </div>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <a
                href="/garimpo-extension.zip"
                download
                className="inline-flex items-center justify-center gap-2 rounded-[14px] px-5 py-3 text-sm font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5"
                style={{ background: "var(--grad)" }}
              >
                <DownloadSimple size={18} weight="bold" />
                Baixar extensao
              </a>
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                No modo real, abra as Opcoes da extensao e entre com sua conta para ela gravar no seu CRM.
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 6. Google Calendar */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Google Calendar"
          sub="Opcional. Quando voce entra com o Google, a agenda conecta automaticamente."
          icon={<Calendar size={20} />}
        >
          <div className="rounded-[14px] border border-border bg-surface-2 p-4">
            <div className="mb-3 text-[13.5px] leading-relaxed text-ink-2">
              A conexao com o Calendar permite marcar reunioes direto pelo sistema sem sair do app.
              Nao e obrigatorio para usar o Garimpo, mas facilita bastante quando as conversas evoluem.
            </div>
            <div className="mb-4 flex items-center gap-2 text-[12.5px] text-faint">
              <Info size={14} />
              O dono da conta habilita o provider Google no console do Supabase. Se o botao nao funcionar, avisa quem cuida da infra.
            </div>

            {googleError && (
              <div className="mb-3 rounded-[12px] border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
                {googleError}
              </div>
            )}

            <button
              type="button"
              onClick={connectGoogle}
              disabled={connectingGoogle}
              className="flex items-center gap-2.5 rounded-[13px] border border-border-2 bg-card px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <GoogleLogo size={18} weight="bold" />
              {connectingGoogle ? "Abrindo login..." : mode === "mock" ? "Conectar (modo demo)" : "Conectar com Google"}
            </button>

            {mode === "mock" && (
              <div className="mt-2.5 flex items-center gap-2 text-[12px] text-faint">
                <Info size={13} />
                Em modo demo, o login nao redireciona de verdade.
              </div>
            )}
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Botao salvar */}
        {/* ------------------------------------------------------------------ */}
        <div className="flex justify-end pb-2">
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 rounded-[14px] px-8 py-3.5 text-[15px] font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
            style={{ background: "var(--grad)" }}
          >
            <Check size={18} weight="bold" />
            {saving ? "Salvando..." : isOnboarding ? "Salvar e comecar" : "Salvar configuracoes"}
          </button>
        </div>
      </div>
    </div>
  );
}
