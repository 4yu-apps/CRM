"use client";
import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  ArrowRight,
  Briefcase,
  Check,
  HandWaving,
  MagnifyingGlass,
  MapPin,
  PaperPlaneTilt,
  PencilSimpleLine,
  Sparkle,
  Target,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import { getProfession, PROFESSIONS, type Profession } from "@/lib/professions";
import type { SearchProfileInput, ServiceTarget } from "@/lib/types";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { ProfessionCard } from "@/components/profession-card";
import { cn } from "@/lib/utils";

// Onboarding de primeiro acesso. Wizard de tela cheia com 3 etapas:
//   1. Profissao (OBRIGATORIA) — dirige score e copy. Nao avanca sem escolher.
//   2. Regiao (OPCIONAL) — estado/cidade pelo IBGE. Da pra pular.
//   3. Resumo — o que o sistema faz + botao Comecar (salva o perfil e entra).
// So aparece quando o gate de auth detecta perfil sem profissao (hasProfile false).

const STEPS = [
  { key: "profissao", label: "Sua area" },
  { key: "regiao", label: "Onde atua" },
  { key: "resumo", label: "Tudo pronto" },
] as const;

// Texto curto que liga a profissao escolhida ao foco da busca.
function focoText(p: Profession): string {
  switch (p.defaultService) {
    case "trafego":
      return "Vou mirar negocios que precisam de anuncio.";
    case "automacao":
      return "Vou mirar quem atende muito no manual.";
    case "ambos":
      return "Voce escolhe trafego ou automacao a cada busca.";
    default:
      return "Vou captar pelos nichos da sua area.";
  }
}

export function OnboardingWizard() {
  const repo = getRepo();
  const { refreshProfile } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Campos coletados no fluxo.
  const [profession, setProfession] = useState<string | null>(null);
  const [niches, setNiches] = useState<string[]>([]);
  const [serviceTarget, setServiceTarget] = useState<ServiceTarget>("indefinido");
  const [state, setState] = useState("");
  const [city, setCity] = useState("");

  // Escolher profissao: guarda o id, pre-seleciona o servico-alvo e sugere os
  // nichos da area (o usuario pode ajustar depois, na Configuracao).
  const chooseProfession = useCallback((p: Profession) => {
    setProfession(p.id);
    setServiceTarget(p.defaultService);
    setNiches(p.suggestedNiches);
  }, []);

  const handleCitySelect = useCallback(
    ({ cidade, uf }: { cidade: string; uf: string }) => {
      setCity(cidade);
      setState(uf);
    },
    [],
  );

  const handleCityClear = useCallback(() => {
    setCity("");
    setState("");
  }, []);

  const selectedProfession = getProfession(profession);

  const finish = useCallback(async () => {
    setSaving(true);
    try {
      const input: SearchProfileInput = {
        profession,
        niches,
        default_service_target: serviceTarget,
        city: city.trim() || null,
        state: state.trim() || null,
      };
      await repo.saveProfile(input);
      // Libera o gate (fonte unica de verdade no contexto de auth).
      await refreshProfile();
      router.replace("/");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar. Tenta de novo.");
      setSaving(false);
    }
  }, [profession, niches, serviceTarget, city, state, repo, refreshProfile, router]);

  const canAdvance = step !== 0 || !!profession;

  const next = useCallback(() => {
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }, []);
  const back = useCallback(() => {
    setStep((s) => Math.max(s - 1, 0));
  }, []);

  const progress = useMemo(() => ((step + 1) / STEPS.length) * 100, [step]);

  return (
    <div className="fixed inset-0 z-[100] flex flex-col overflow-y-auto bg-background">
      {/* Topo: marca + progresso */}
      <header className="flex-none border-b border-border bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[760px] flex-col gap-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div
                className="flex size-9 flex-none items-center justify-center rounded-[12px] text-white"
                style={{ background: "var(--grad)" }}
              >
                <Sparkle size={18} weight="fill" />
              </div>
              <span className="text-[15px] font-bold tracking-tight">Garimpo</span>
            </div>
            <span className="text-[12.5px] font-semibold text-muted-foreground">
              Passo {step + 1} de {STEPS.length}
            </span>
          </div>

          {/* Barra de progresso */}
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--inset)]">
            <div
              className="h-full rounded-full transition-[width] duration-300 ease-out"
              style={{ width: `${progress}%`, background: "var(--grad)" }}
            />
          </div>

          {/* Rotulos das etapas */}
          <div className="flex items-center gap-2">
            {STEPS.map((s, i) => (
              <div
                key={s.key}
                className={cn(
                  "flex items-center gap-1.5 text-[12px] font-semibold transition-colors",
                  i === step ? "text-brand" : i < step ? "text-success" : "text-faint",
                )}
              >
                <span
                  className={cn(
                    "flex size-5 flex-none items-center justify-center rounded-full text-[10px] font-bold",
                    i === step
                      ? "bg-brand text-white"
                      : i < step
                        ? "bg-success text-white"
                        : "bg-[var(--inset)] text-faint",
                  )}
                >
                  {i < step ? <Check size={11} weight="bold" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{s.label}</span>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Corpo da etapa */}
      <main className="flex-1 px-5 py-8 sm:px-8">
        <div className="mx-auto max-w-[760px]">
          {/* ----- Etapa 1: Profissao (obrigatoria) ----- */}
          {step === 0 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <div className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-brand-50 text-brand">
                  <HandWaving size={24} weight="duotone" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight">
                    Pra que voce usa o sistema?
                  </h1>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Escolha a sua area. Eu uso isso pra sugerir os nichos certos, pontuar
                    os leads e escrever a primeira mensagem do seu jeito.
                  </p>
                </div>
              </div>

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
                    Boa. Voce mira em:{" "}
                    <strong className="font-bold text-brand">{selectedProfession.mira}</strong>{" "}
                    {focoText(selectedProfession)} Ja deixei os nichos dessa area sugeridos,
                    da pra ajustar tudo depois na Configuracao.
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ----- Etapa 2: Regiao (opcional) ----- */}
          {step === 1 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <div className="flex size-11 flex-none items-center justify-center rounded-[14px] bg-brand-50 text-brand">
                  <MapPin size={24} weight="duotone" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight">
                    Onde voce quer atuar?
                  </h1>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    Opcional. Se voce escolher uma regiao, eu ja comeco a busca por perto.
                    Pode deixar em branco e definir depois.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-faint">
                    Cidade base
                  </span>
                  <CityAutocomplete
                    cidade={city}
                    uf={state}
                    onSelect={handleCitySelect}
                    onClear={handleCityClear}
                    placeholder="Digite a cidade (ex: Maringa, Sao Paulo...)"
                  />
                  <p className="mt-1.5 text-[12px] text-faint">
                    Comece a digitar e escolha a cidade. Ja vem com o estado (ex: Maringa - PR).
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ----- Etapa 3: Resumo ----- */}
          {step === 2 && (
            <div>
              <div className="mb-6 flex items-start gap-3">
                <div
                  className="flex size-11 flex-none items-center justify-center rounded-[14px] text-white"
                  style={{ background: "var(--grad)" }}
                >
                  <Sparkle size={24} weight="fill" />
                </div>
                <div>
                  <h1 className="font-heading text-2xl font-bold tracking-tight">
                    Pronto. Daqui eu assumo.
                  </h1>
                  <p className="mt-1 text-[14px] leading-relaxed text-muted-foreground">
                    {selectedProfession
                      ? `Configurado pra ${selectedProfession.label}.`
                      : "Tudo certo pra comecar."}{" "}
                    Veja como funciona o dia a dia.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {[
                  {
                    icon: MagnifyingGlass,
                    titulo: "Eu garimpo",
                    texto: "Encontro negocios com a sua cara e enriqueco com os dados que importam.",
                  },
                  {
                    icon: PencilSimpleLine,
                    titulo: "Eu escrevo",
                    texto: "Monto a primeira mensagem pronta, no tom certo pra cada lead.",
                  },
                  {
                    icon: PaperPlaneTilt,
                    titulo: "Voce conversa",
                    texto: "Voce aprova, manda e fecha. O sistema cuida do resto.",
                  },
                ].map(({ icon: Icon, titulo, texto }) => (
                  <div
                    key={titulo}
                    className="flex flex-col gap-2 rounded-[16px] border border-border-2 bg-surface-2 p-4"
                  >
                    <div className="flex size-10 flex-none items-center justify-center rounded-[12px] bg-brand-50 text-brand">
                      <Icon size={20} weight="duotone" />
                    </div>
                    <div className="text-[14px] font-bold text-ink">{titulo}</div>
                    <div className="text-[12.5px] leading-relaxed text-muted-foreground">{texto}</div>
                  </div>
                ))}
              </div>

              {/* Resumo do que foi escolhido */}
              <div className="mt-4 rounded-[14px] border border-border bg-card p-4 text-[13px] text-ink-2">
                <div className="flex items-center gap-2">
                  <Briefcase size={15} className="flex-none text-brand" />
                  <span>
                    Area:{" "}
                    <strong className="font-bold text-ink">
                      {selectedProfession?.label ?? "nao escolhida"}
                    </strong>
                  </span>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <MapPin size={15} className="flex-none text-brand" />
                  <span>
                    Regiao:{" "}
                    <strong className="font-bold text-ink">
                      {[city, state].filter(Boolean).join(" / ") || "qualquer lugar (defina depois)"}
                    </strong>
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Rodape: navegacao */}
      <footer className="flex-none border-t border-border bg-card px-5 py-4 sm:px-8">
        <div className="mx-auto flex max-w-[760px] items-center justify-between gap-3">
          {step > 0 ? (
            <button
              type="button"
              onClick={back}
              disabled={saving}
              className="flex items-center gap-2 rounded-[14px] border border-border-2 bg-card px-5 py-3 text-[14px] font-bold text-ink-2 transition-colors hover:bg-surface-2 disabled:opacity-60"
            >
              <ArrowLeft size={17} weight="bold" />
              Voltar
            </button>
          ) : (
            <span />
          )}

          <div className="flex items-center gap-2.5">
            {/* Pular: so na etapa opcional de regiao */}
            {step === 1 && (
              <button
                type="button"
                onClick={next}
                className="rounded-[14px] px-4 py-3 text-[14px] font-bold text-muted-foreground transition-colors hover:text-ink"
              >
                Pular
              </button>
            )}

            {step < STEPS.length - 1 ? (
              <button
                type="button"
                onClick={next}
                disabled={!canAdvance}
                className="flex items-center gap-2 rounded-[14px] px-7 py-3 text-[14px] font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
                style={{ background: "var(--grad)" }}
              >
                {step === 0 && !profession ? "Escolha uma area" : "Continuar"}
                <ArrowRight size={17} weight="bold" />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={saving}
                className="flex items-center gap-2 rounded-[14px] px-7 py-3 text-[14px] font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5 disabled:opacity-60 disabled:hover:translate-y-0"
                style={{ background: "var(--grad)" }}
              >
                <Check size={17} weight="bold" />
                {saving ? "Preparando..." : "Comecar"}
              </button>
            )}
          </div>
        </div>
      </footer>
    </div>
  );
}
