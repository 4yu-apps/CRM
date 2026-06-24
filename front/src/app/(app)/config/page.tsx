"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Briefcase,
  Calendar,
  Check,
  DownloadSimple,
  GearSix,
  Globe,
  GoogleLogo,
  HandWaving,
  Info,
  MapPin,
  PuzzlePiece,
  Robot,
  Storefront,
  Target,
  X,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import { LOCALES, useLocale, useT } from "@/lib/i18n";
import { fetchEstados, fetchMunicipios, type Municipio, type UF } from "@/lib/ibge";
import { PROFESSIONS, getProfession, type Profession } from "@/lib/professions";
import type { SearchProfile, SearchProfileInput, ServiceTarget } from "@/lib/types";
import { RAMOS_DISPONIVEIS } from "@/lib/ramos";
import { Dropdown } from "@/components/dropdown";
import { ProfessionCard } from "@/components/profession-card";
import { cn } from "@/lib/utils";


// Mesmas opcoes da tela Buscar, pra um raio salvo (ex.: "2km") nao sumir no Dropdown.
const RAIOS: { value: string; label: string }[] = [
  { value: "1km", label: "Até 1 km" },
  { value: "2km", label: "Até 2 km" },
  { value: "3km", label: "Até 3 km" },
  { value: "5km", label: "Até 5 km" },
  { value: "10km", label: "Até 10 km" },
  { value: "25km", label: "Até 25 km" },
  { value: "50km", label: "Até 50 km" },
  { value: "cidade", label: "Cidade toda" },
];

// O servico-alvo NAO e uma escolha a parte: ele SAI da profissao. Este texto
// explica, na propria secao da area, o que a profissao escolhida implica pra
// busca — deixando o vinculo profissao -> servico claro, sem secao redundante.
function serviceFocusText(p: Profession): string {
  switch (p.defaultService) {
    case "trafego":
      return "Foco em Tráfego: a busca mira negócios que precisam de anúncio.";
    case "automacao":
      return "Foco em Automação: a busca mira quem atende muito no manual.";
    case "ambos":
      return "Tráfego + Automação: na tela Buscar você escolhe o foco a cada busca.";
    default:
      return "Você capta pelos nichos da sua área — sem alvo de tráfego/automação.";
  }
}

// ---------------------------------------------------------------------------
// Toggle simples sem dependencia de lib
// ---------------------------------------------------------------------------
function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
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
  const { signInWithGoogle, mode, refreshProfile, session } = useAuth();
  const router = useRouter();
  const { locale, setLocale } = useLocale();
  const t = useT();

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
  // Espelho do valor JA salvo, pra avisar quando o toggle ainda nao foi salvo.
  const [savedAutopilot, setSavedAutopilot] = useState(false);
  const [profession, setProfession] = useState<string | null>(null);

  // Listas vindas do IBGE para os selects em cascata (estado -> cidade)
  const [estados, setEstados] = useState<UF[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);


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
          setSavedAutopilot(profile.autopilot ?? false);
          setProfession(profile.profession ?? null);
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

  // Escolher uma profissao: guarda o id, pre-seleciona o servico-alvo e sugere
  // os nichos da area (preenchendo os chips, que o usuario ainda pode ajustar).
  const chooseProfession = useCallback((p: Profession) => {
    setProfession(p.id);
    setServiceTarget(p.defaultService);
    setNiches((prev) => {
      const lower = prev.map((n) => n.toLowerCase());
      const merged = [...prev];
      for (const n of p.suggestedNiches) {
        if (!lower.includes(n.toLowerCase())) merged.push(n);
      }
      return merged;
    });
  }, []);


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
        profession,
      };
      await repo.saveProfile(input);
      setSavedAutopilot(autopilot);
      // Libera o gate de onboarding (fonte unica no contexto de auth).
      await refreshProfile();
      const wasOnboarding = isOnboarding;
      setIsOnboarding(false);
      toast.success("Tudo salvo. Já estou rodando pra você.");
      // No primeiro acesso, manda pro Inicio depois de salvar o perfil.
      if (wasOnboarding) router.push("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar. Tenta de novo.");
    } finally {
      setSaving(false);
    }
  }, [niches, city, state, radius, serviceTarget, autopilot, profession, repo, refreshProfile, isOnboarding, router]);

  // Ja conectou com o Google? (login via Google => agenda disponivel)
  const meta = session?.user?.app_metadata as { provider?: string; providers?: string[] } | undefined;
  const googleConnected =
    mode === "supabase" &&
    !!session &&
    (meta?.provider === "google" ||
      (meta?.providers ?? []).includes("google") ||
      !!session.provider_token);

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
          "O login com Google ainda não está habilitado nesta instalação. Peça ao administrador ativar o provider Google no painel do Supabase.",
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
          <span className="text-sm">Carregando configurações...</span>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const selectedProfession = getProfession(profession);

  return (
    <div className="mx-auto max-w-[760px]">
      {/* Boas-vindas calorosas no primeiro acesso */}
      {isOnboarding ? (
        <div className="mb-6 overflow-hidden rounded-[20px] border border-brand/25 bg-card shadow-[var(--shadow)]">
          <div className="p-6" style={{ background: "var(--grad)" }}>
            <div className="flex items-start gap-3">
              <div className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-white/15 text-white backdrop-blur">
                <HandWaving size={24} weight="duotone" />
              </div>
              <div>
                <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
                  Bem-vindo! Vamos deixar o sistema com a sua cara.
                </h1>
                <p className="mt-1 text-[14px] leading-relaxed text-white/85">
                  São dois minutinhos. Você me conta o que faz e onde atua, e eu já saio
                  garimpando os clientes certos pra você. Pode ajustar tudo quando quiser.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-[14px] bg-brand-50 text-brand">
              <GearSix size={24} weight="duotone" />
            </div>
            <div>
              <h1 className="font-heading text-2xl font-bold tracking-tight">Configuração</h1>
              <p className="mt-0.5 text-[14px] text-muted-foreground">
                Você ajusta isso uma vez. Depois eu trabalho sozinho no dia a dia.
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-5">
        {/* ------------------------------------------------------------------ */}
        {/* Idioma do sistema */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title={t("cfg.lang.title", "Idioma")}
          sub={t("cfg.lang.sub", "Escolha o idioma do sistema.")}
          icon={<Globe size={20} />}
        >
          <Dropdown
            value={locale}
            onChange={(v) => setLocale(v as typeof locale)}
            ariaLabel={t("cfg.lang.title", "Idioma")}
            options={LOCALES.map((l) => ({ value: l.value, label: `${l.flag} ${l.label}` }))}
          />
          <p className="mt-3 text-[12.5px] leading-relaxed text-muted-foreground">
            {t(
              "cfg.lang.note",
              "Por enquanto traduzo o menu e os titulos. As telas internas seguem em portugues e vao sendo traduzidas aos poucos.",
            )}
          </p>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 0. Profissao (vertical) */}
        {/* ------------------------------------------------------------------ */}
        {isOnboarding ? (
          <Section
            title="Pra que você usa o sistema?"
            sub="Escolha a sua área. Eu uso isso pra sugerir os nichos certos e mirar o serviço que você vende."
            icon={<Briefcase size={20} />}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROFESSIONS.map((p) => (
                <ProfessionCard
                  key={p.id}
                  profession={p}
                  selected={profession === p.id}
                  onSelect={chooseProfession}
                />
              ))}
            </div>
            {selectedProfession && (
              <div className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-brand/20 bg-brand-50/70 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                <Target size={16} className="mt-0.5 flex-none text-brand" />
                <span>
                  Boa. Você mira em: <strong className="font-bold text-brand">{selectedProfession.mira}</strong>{" "}
                  Já deixei os nichos dessa área sugeridos abaixo, mas pode mexer à vontade.
                  <span className="mt-1 block text-faint">{serviceFocusText(selectedProfession)}</span>
                </span>
              </div>
            )}
          </Section>
        ) : (
          <Section
            title="Sua área"
            sub="A área define os nichos sugeridos e o serviço-alvo. Pode trocar quando quiser."
            icon={<Briefcase size={20} />}
          >
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {PROFESSIONS.map((p) => (
                <ProfessionCard
                  key={p.id}
                  profession={p}
                  selected={profession === p.id}
                  onSelect={chooseProfession}
                />
              ))}
            </div>
            {selectedProfession ? (
              <div className="mt-4 flex items-start gap-2.5 rounded-[14px] border border-brand/20 bg-brand-50/70 px-4 py-3 text-[13px] leading-relaxed text-ink-2">
                <Target size={16} className="mt-0.5 flex-none text-brand" />
                <span>{serviceFocusText(selectedProfession)}</span>
              </div>
            ) : (
              <div className="mt-4 flex items-center gap-2 text-[12.5px] text-faint">
                <Info size={14} />
                Você ainda não escolheu uma área. Escolha uma pra eu afinar as sugestões.
              </div>
            )}
          </Section>
        )}

        {/* ------------------------------------------------------------------ */}
        {/* 1. Ramos */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Ramos que você atende"
          sub="Vou priorizar esses tipos de negócio na busca automática."
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

          {/* Ramos disponiveis */}
          <div>
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-faint">Ramos disponíveis</div>
            <div className="flex flex-wrap gap-2">
              {RAMOS_DISPONIVEIS.filter((r) => !niches.map((n) => n.toLowerCase()).includes(r.toLowerCase())).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => addNiche(r)}
                  className="rounded-full border border-border-2 bg-surface-2 px-3 py-1.5 text-[12.5px] font-medium text-ink-2 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
                >
                  + {r}
                </button>
              ))}
              {RAMOS_DISPONIVEIS.filter((r) => !niches.map((n) => n.toLowerCase()).includes(r.toLowerCase())).length === 0 && (
                <span className="text-[13px] text-faint">Você já selecionou todos.</span>
              )}
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 2. Onde buscar */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Onde buscar"
          sub="Defina a região principal. Posso buscar mais largo se quiser."
          icon={<MapPin size={20} />}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Estado (UF) */}
            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint">
                Estado
              </span>
              <Dropdown
                value={state}
                onChange={handleStateChange}
                ariaLabel="Estado"
                placeholder="Escolha o estado"
                options={estados.map((uf) => ({ value: uf.sigla, label: `${uf.nome} (${uf.sigla})` }))}
              />
            </div>

            {/* Cidade base (cascata a partir do estado) */}
            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint">
                Cidade base
              </span>
              <Dropdown
                value={city}
                onChange={setCity}
                ariaLabel="Cidade base"
                disabled={!state || loadingCidades}
                placeholder={
                  !state ? "Escolha o estado antes" : loadingCidades ? "Carregando cidades..." : "Escolha a cidade"
                }
                options={municipios.map((m) => ({ value: m.nome, label: m.nome }))}
              />
            </div>

            {/* Raio */}
            <div>
              <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint">
                Raio de atuação
              </span>
              <Dropdown value={radius} onChange={setRadius} ariaLabel="Raio de atuação" options={RAIOS} />
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* Piloto automatico */}
        {/* ------------------------------------------------------------------ */}
        <div className="overflow-hidden rounded-[20px] border border-border bg-card shadow-[var(--shadow)]">
          <div className="flex items-center justify-between gap-4 p-6">
            <div className="flex items-center gap-3">
              <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-brand-50 text-brand">
                <Robot size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <div className="text-[15px] font-bold">Busca no piloto automático</div>
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[11px] font-bold",
                      autopilot ? "bg-brand-50 text-brand" : "bg-[var(--inset)] text-muted-foreground",
                    )}
                  >
                    {autopilot ? "Ligado" : "Desligado"}
                  </span>
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {autopilot
                    ? "Eu cubro o mapa em ordem e encho a fila sem você precisar pedir."
                    : "Está desligado. Você só recebe leads quando clicar em Buscar."}
                </div>
              </div>
            </div>
            <Toggle on={autopilot} onChange={setAutopilot} label="Busca no piloto automático" />
          </div>
          {autopilot !== savedAutopilot && (
            <div className="border-t border-border bg-warn-bg px-6 py-2.5 text-[12.5px] font-semibold text-warn">
              Alteração não salva. Clique em Salvar configurações lá embaixo pra valer.
            </div>
          )}
        </div>

        {/* ------------------------------------------------------------------ */}
        {/* 5. Extensao Chrome */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Extensão Chrome"
          sub="Uma extensão só. Ela aparece no Google Maps para capturar e no WhatsApp Web para atualizar o funil."
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
                Baixar extensão
              </a>
              <div className="text-[12.5px] leading-relaxed text-muted-foreground">
                No modo real, abra as Opções da extensão e entre com sua conta para ela gravar no seu CRM.
              </div>
            </div>
          </div>
        </Section>

        {/* ------------------------------------------------------------------ */}
        {/* 6. Google Calendar */}
        {/* ------------------------------------------------------------------ */}
        <Section
          title="Google Calendar"
          sub="Opcional. Quando você entra com o Google, a agenda conecta automaticamente."
          icon={<Calendar size={20} />}
        >
          <div className="rounded-[14px] border border-border bg-surface-2 p-4">
            <div className="mb-3 text-[13.5px] leading-relaxed text-ink-2">
              A conexão com o Calendar permite marcar reuniões direto pelo sistema sem sair do app.
              Não é obrigatório para usar o 4YU CRM, mas facilita bastante quando as conversas evoluem.
            </div>
            <div className="mb-4 flex items-center gap-2 text-[12.5px] text-faint">
              <Info size={14} />
              O dono da conta habilita o provider Google no console do Supabase. Se o botão não funcionar, avisa quem cuida da infra.
            </div>

            {googleError && (
              <div className="mb-3 rounded-[12px] border border-danger/30 bg-danger-bg p-3 text-[13px] text-danger">
                {googleError}
              </div>
            )}

            {googleConnected ? (
              <div className="flex items-center gap-2.5 rounded-[13px] border border-success/40 bg-surface-2 px-4 py-2.5 text-sm font-bold text-success">
                <Check size={18} weight="bold" />
                Google Calendar conectado
              </div>
            ) : (
              <button
                type="button"
                onClick={connectGoogle}
                disabled={connectingGoogle}
                className="flex items-center gap-2.5 rounded-[13px] border border-border-2 bg-card px-4 py-2.5 text-sm font-bold text-ink transition-colors hover:bg-surface-2 disabled:opacity-60"
              >
                <GoogleLogo size={18} weight="bold" />
                {connectingGoogle ? "Abrindo login..." : mode === "mock" ? "Conectar (modo demo)" : "Conectar com Google"}
              </button>
            )}

            {mode === "mock" && (
              <div className="mt-2.5 flex items-center gap-2 text-[12px] text-faint">
                <Info size={13} />
                Em modo demo, o login não redireciona de verdade.
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
            {saving ? "Salvando..." : isOnboarding ? "Salvar e começar" : "Salvar configurações"}
          </button>
        </div>
      </div>
    </div>
  );
}
