"use client";
import { useEffect, useMemo, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { toast } from "sonner";
import {
  ArrowRight,
  Info,
  MagnifyingGlass,
  MapTrifold,
  Shuffle,
  Spinner,
  X,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { useAuth } from "@/lib/auth";
import { fetchEstados, fetchMunicipios } from "@/lib/ibge";
import { geocodeCity, geocodeNeighborhood, stateCenter, type GeoPoint } from "@/lib/geocode";
import { serviceOptionsForProfile } from "@/lib/professions";
import { SERVICE_META } from "@/lib/service";
import { RAMOS_DISPONIVEIS } from "@/lib/ramos";
import { Dropdown } from "@/components/dropdown";
import { CityAutocomplete } from "@/components/city-autocomplete";
import { BairroAutocomplete } from "@/components/bairro-autocomplete";
import { MultiRamoDropdown } from "@/components/multi-ramo-dropdown";
import type { ScanCoverage, SearchProfile, ServiceTarget } from "@/lib/types";
import { cn } from "@/lib/utils";

// Mapa carregado somente no cliente (Leaflet nao roda no SSR)
const CoverageMap = dynamic(() => import("@/components/coverage-map"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
      Carregando mapa...
    </div>
  ),
});

// Centro padrao do Brasil (usado quando sem coordenadas no perfil)
const BRASIL_CENTER = { lat: -14.235, lng: -51.925, zoom: 4 };

const RADIUS_OPTIONS = [
  { value: "1km", label: "Até 1 km (bairro)" },
  { value: "2km", label: "Até 2 km" },
  { value: "3km", label: "Até 3 km" },
  { value: "5km", label: "Até 5 km" },
  { value: "10km", label: "Até 10 km" },
  { value: "25km", label: "Até 25 km" },
  { value: "50km", label: "Até 50 km" },
  { value: "cidade", label: "Cidade toda" },
];

// Converte o valor do campo radius ("10km", "25km", "cidade") para numero em km.
function radiusValueToKm(r: string): number | undefined {
  const m = /^(\d+)km$/i.exec(r);
  if (!m) return undefined;
  return parseInt(m[1], 10);
}

// Chave de regiao igual a do robo (autopilot.region_key): cidade + estado sem
// acento. Usada pra filtrar a cobertura pela cidade escolhida na tela.
function slugRegion(city: string | null, state: string | null): string {
  const base = `${city ?? ""} ${state ?? ""}`
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "sem-regiao";
}

function rnd<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function pctColor(pct: number): string {
  if (pct >= 70) return "#7C3AED";
  if (pct >= 30) return "#9B6BE8";
  if (pct > 0) return "#C4A8F0";
  return "#b9b2c4";
}

// Toggle de servico-alvo.
function ServiceToggle({
  value,
  options,
  onChange,
}: {
  value: ServiceTarget;
  options: ServiceTarget[];
  onChange: (v: ServiceTarget) => void;
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border border-border-2">
      {options.map((v) => (
        <button
          key={v}
          type="button"
          onClick={() => onChange(v)}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold transition-colors",
            value === v
              ? "text-white"
              : "bg-surface-2 text-muted-foreground hover:bg-brand-50 hover:text-brand",
          )}
          style={value === v ? { background: "var(--grad)" } : undefined}
        >
          {SERVICE_META[v].short}
        </button>
      ))}
    </div>
  );
}

// Chips dos ramos selecionados com botao de remover individual.
function RamoChips({
  ramos,
  onRemove,
}: {
  ramos: string[];
  onRemove: (r: string) => void;
}) {
  if (ramos.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {ramos.map((r) => (
        <span
          key={r}
          className="flex items-center gap-1.5 rounded-full border border-brand/30 bg-brand-50 px-2.5 py-1 text-[12px] font-semibold text-brand"
        >
          {r}
          <button
            type="button"
            onClick={() => onRemove(r)}
            aria-label={`Remover ramo ${r}`}
            className="flex items-center rounded-full hover:text-brand/70"
          >
            <X size={11} weight="bold" />
          </button>
        </span>
      ))}
    </div>
  );
}

export default function BuscarPage() {
  const repo = getRepo();
  const { user } = useAuth();

  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<ScanCoverage[]>([]);

  // niches e um array (multi-selecao)
  const [niches, setNiches] = useState<string[]>([]);
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [radius, setRadius] = useState("10km");
  const [service, setService] = useState<ServiceTarget>("trafego");

  // Estados para o Surpreenda-me
  const [estados, setEstados] = useState<Awaited<ReturnType<typeof fetchEstados>>>([]);

  // Estado de submit + acompanhamento ao vivo da busca
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [baseline, setBaseline] = useState<{ total: number; ready: number } | null>(null);
  const [found, setFound] = useState<{ novos: number; prontos: number }>({ novos: 0, prontos: 0 });

  // Filtro de nicho no mapa
  const [mapNiche, setMapNiche] = useState<string | undefined>(undefined);

  // Ponto geocodificado da regiao escolhida (cidade ou bairro) pra dar zoom.
  const [cityPoint, setCityPoint] = useState<GeoPoint | null>(null);
  // Coordenada exata do bairro escolhido (vem do autocomplete). Quando setada,
  // e o centro do raio no mapa, em vez do centro da cidade.
  const [bairroPoint, setBairroPoint] = useState<GeoPoint | null>(null);

  // Opcoes de servico-alvo conforme a profissao configurada no perfil.
  const serviceOpts = useMemo(() => serviceOptionsForProfile(profile), [profile]);

  // Nichos oferecidos: os do perfil primeiro, depois os 20 ramos canonicos (sem repetir).
  const nicheOptions = useMemo(() => {
    return Array.from(new Set([...(profile?.niches ?? []), ...RAMOS_DISPONIVEIS]));
  }, [profile]);

  const load = useCallback(async () => {
    try {
      const [p, cov] = await Promise.all([repo.getProfile(), repo.listCoverage()]);
      if (p) {
        setProfile(p);
        // Inicia com o primeiro nicho do perfil (retrocompat: uma selecao)
        setNiches(p.niches.length > 0 ? [p.niches[0]] : []);
        setUf(p.state ?? "");
        setCity(p.city ?? "");
        setNeighborhood(p.neighborhood ?? "");
        setRadius(p.radius ?? "10km");
        const opts = serviceOptionsForProfile(p);
        const saved = p.default_service_target ?? "trafego";
        setService(
          opts.length === 0 ? "indefinido" : opts.includes(saved) ? saved : opts[0],
        );
      }
      setCoverage(cov);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao carregar perfil");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  // Recarrega cobertura quando filtro de nicho muda
  useEffect(() => {
    if (loading) return;
    repo.listCoverage(mapNiche).then(setCoverage).catch(() => null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapNiche]);

  // Carrega estados uma vez (para o Surpreenda-me)
  useEffect(() => {
    fetchEstados().then(setEstados).catch(() => null);
  }, []);

  // Recentra o mapa em TEMPO REAL conforme cidade ou bairro mudam
  useEffect(() => {
    if (!city) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCityPoint(null);
      return;
    }
    let ativo = true;
    const bairro = neighborhood.trim();
    const buscar = () => {
      const p = bairro ? geocodeNeighborhood(bairro, city, uf) : geocodeCity(city, uf);
      p.then((ponto) => {
        if (ativo && ponto) setCityPoint(ponto);
      }).catch(() => null);
    };
    const t = setTimeout(buscar, bairro ? 600 : 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [city, uf, neighborhood]);

  // Acompanhamento ao vivo da busca
  useEffect(() => {
    if (!searching || !baseline) return;
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const startedAt = Date.now();
    const LIMITE_MS = 3 * 60 * 1000;
    const tick = async () => {
      try {
        const [total, ready] = await Promise.all([
          repo.countByStatus(),
          repo.countByStatus("rascunho_pronto"),
        ]);
        if (!stop) {
          setFound({
            novos: Math.max(0, total - baseline.total),
            prontos: Math.max(0, ready - baseline.ready),
          });
        }
      } catch {
        // solucao de rede: ignora
      }
      if (!stop) {
        if (Date.now() - startedAt < LIMITE_MS) timer = setTimeout(tick, 6000);
        else setSearching(false);
      }
    };
    timer = setTimeout(tick, 5000);
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [searching, baseline, repo]);

  // Toggle de nicho: adiciona ou remove da lista (multi-selecao)
  const handleNicheToggle = useCallback((ramo: string) => {
    setNiches((prev) =>
      prev.includes(ramo) ? prev.filter((r) => r !== ramo) : [...prev, ramo],
    );
  }, []);

  // Autocomplete de cidade: selecionar preenche cidade e estado juntos
  const handleCitySelect = useCallback(
    ({ cidade, uf: novaUf }: { cidade: string; uf: string }) => {
      setCity(cidade);
      setUf(novaUf);
      // Trocar de cidade invalida o bairro anterior.
      setNeighborhood("");
      setBairroPoint(null);
    },
    [],
  );

  const handleCityClear = useCallback(() => {
    setCity("");
    setUf("");
    setCityPoint(null);
    setNeighborhood("");
    setBairroPoint(null);
  }, []);

  // Surpreenda-me: randomiza ramo, estado e cidade
  const handleSurpreendaMe = useCallback(async () => {
    const pool = profile?.niches?.length ? profile.niches : RAMOS_DISPONIVEIS;
    const ramo = rnd(pool);
    setNiches([ramo]);
    setNeighborhood("");

    if (estados.length === 0) {
      toast.success(`Ramo sorteado: ${ramo}`);
      return;
    }
    const ufRnd = rnd(estados).sigla;
    setUf(ufRnd);
    setCity("");
    try {
      const lista = await fetchMunicipios(ufRnd);
      if (lista.length) {
        const cidadeRnd = rnd(lista).nome;
        setCity(cidadeRnd);
        toast.success(`Sorteado: ${ramo} em ${cidadeRnd} / ${ufRnd}`);
        return;
      }
    } catch {
      // sem cidades: fica so com estado + ramo
    }
    toast.success(`Sorteado: ${ramo} em ${ufRnd}`);
  }, [profile, estados]);

  const handleBuscar = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      // 1) Marca a linha de base
      let base = { total: 0, ready: 0 };
      try {
        const [t, r] = await Promise.all([
          repo.countByStatus(),
          repo.countByStatus("rascunho_pronto"),
        ]);
        base = { total: t, ready: r };
      } catch {
        // sem baseline
      }
      setBaseline(base);
      setFound({ novos: 0, prontos: 0 });

      // 2) Salva o alvo com todos os nichos selecionados
      await repo.saveProfile({
        niches: niches.length > 0 ? niches : profile?.niches ?? [],
        city: city || null,
        state: uf || null,
        neighborhood: neighborhood.trim() || null,
        radius,
        default_service_target: serviceOpts.length === 0 ? "indefinido" : service,
      });

      // 3) Dispara o robo para cada nicho selecionado em paralelo.
      // A API /api/search/run aceita um nicho por vez; chamamos uma vez por ramo.
      const ramosParaBuscar =
        niches.length > 0 ? niches : (profile?.niches?.slice(0, 1) ?? []);
      const disparos = ramosParaBuscar.map((nicho) =>
        fetch("/api/search/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            owner_id: user?.id ?? null,
            niche: nicho,
            city: city || null,
            state: uf || null,
            neighborhood: neighborhood.trim() || null,
          }),
        })
          .then((res) =>
            res.json().catch(() => null) as Promise<{ ok: boolean } | null>,
          )
          .catch(() => null),
      );
      const resultados = await Promise.all(disparos);
      const algumOk = resultados.some((r) => r?.ok === true);

      // 4) Acompanha os leads chegando
      setSearching(true);
      if (algumOk) {
        const labelBusca =
          ramosParaBuscar.length === 1
            ? `Busca disparada para "${ramosParaBuscar[0]}"!`
            : `Busca disparada para ${ramosParaBuscar.length} ramos!`;
        toast.success(`${labelBusca} Acompanhe os leads chegando aqui embaixo.`);
      } else {
        toast.message(
          "Alvo salvo. O robô busca no próximo ciclo — deixei o acompanhamento ligado.",
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alvo");
    } finally {
      setSaving(false);
    }
  }, [saving, repo, niches, profile, city, uf, neighborhood, radius, service, serviceOpts, user]);

  // Coordenadas para o mapa.
  const mapCenter = (() => {
    if (bairroPoint) return { lat: bairroPoint.lat, lng: bairroPoint.lng, zoom: 14 };
    if (cityPoint)
      return { lat: cityPoint.lat, lng: cityPoint.lng, zoom: neighborhood.trim() ? 14 : 12 };
    // So o estado escolhido (sem cidade ainda): centra na UF com zoom estadual.
    const sc = stateCenter(uf);
    if (sc) return { lat: sc.lat, lng: sc.lng, zoom: 6 };
    const first = coverage.find((c) => c.center_lat != null && c.center_lng != null);
    if (first) return { lat: first.center_lat!, lng: first.center_lng!, zoom: 12 };
    return BRASIL_CENTER;
  })();

  const mapKey = `${mapCenter.lat.toFixed(3)},${mapCenter.lng.toFixed(3)},${mapCenter.zoom}`;

  // Cobertura mostrada: filtrada pela cidade escolhida.
  const covFiltered = useMemo(() => {
    if (!city) return coverage;
    const key = slugRegion(city, uf);
    return coverage.filter((z) => z.region_key === key);
  }, [coverage, city, uf]);

  // Raio em km para o mapa visual
  const radiusKm = radiusValueToKm(radius);

  if (loading) {
    return (
      <div className="mx-auto flex max-w-[1120px] items-center justify-center py-24">
        <Spinner size={28} className="animate-spin text-brand" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[1120px]">
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">

        {/* Coluna esquerda: formulario */}
        <div className="fu rounded-[20px] border border-border bg-card p-7 shadow-[var(--shadow)]">
          <div className="mb-1 text-[17px] font-bold">Definir alvo de busca</div>
          <p className="mb-6 text-[13.5px] text-muted-foreground">
            Escolha onde e o que garimpar e clique em buscar pra disparar na hora. O robô roda no
            servidor e os leads novos vão subindo na sua fila — você acompanha aqui em tempo real.
          </p>

          {/* Ramos (multi-selecao com chips) */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label className="block text-[12px] font-bold uppercase tracking-wider text-faint">
                Ramo
              </label>
              <button
                type="button"
                onClick={() => void handleSurpreendaMe()}
                title="Sorteia estado, cidade e ramo pra você garimpar uma região nova sem pensar"
                aria-label="Surpreenda-me: sortear região e ramo aleatórios"
                className="flex items-center gap-1.5 rounded-full border border-border-2 bg-surface-2 px-3 py-1 text-[12px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
              >
                <Shuffle size={14} weight="bold" />
                Surpreenda-me
              </button>
            </div>
            <MultiRamoDropdown
              selected={niches}
              options={[...nicheOptions]}
              onToggle={handleNicheToggle}
            />
            <RamoChips
              ramos={niches}
              onRemove={(r) => setNiches((prev) => prev.filter((x) => x !== r))}
            />
            {niches.length > 1 && (
              <p className="mt-1.5 text-[12px] text-faint">
                O robô vai buscar em paralelo para cada ramo selecionado.
              </p>
            )}
          </div>

          {/* Cidade com autocomplete nacional (tipo Uber) */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Cidade
            </label>
            <CityAutocomplete
              cidade={city}
              uf={uf}
              onSelect={handleCitySelect}
              onClear={handleCityClear}
              placeholder="Digite a cidade (ex: Maringá, São Paulo...)"
            />
            <p className="mt-1.5 text-[12px] text-faint">
              Comece a digitar e escolha a cidade. Já vem com o estado (ex: Maringá - PR).
            </p>
          </div>

          {/* Bairro ou zona (autocomplete + texto livre, opcional) */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Bairro ou zona{" "}
              <span className="font-medium normal-case text-faint">(opcional)</span>
            </label>
            <BairroAutocomplete
              value={neighborhood}
              onChange={(v) => {
                setNeighborhood(v);
                setBairroPoint(null);
              }}
              onPick={(s) => {
                setNeighborhood(s.name);
                setBairroPoint({ lat: s.lat, lng: s.lng });
              }}
              city={city}
              uf={uf}
              placeholder={
                city ? "Comece a digitar o bairro ou zona (em branco = cidade toda)" : "Escolha a cidade primeiro"
              }
              disabled={!city}
            />
            <p className="mt-1.5 text-[12px] text-faint">
              Comece a digitar e escolha o bairro da cidade. O mapa foca ali e o robô afunila a busca.
            </p>
          </div>

          {/* Raio */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Raio de atuação
            </label>
            <Dropdown
              value={radius}
              onChange={setRadius}
              ariaLabel="Raio de atuação"
              options={RADIUS_OPTIONS}
            />
          </div>

          {/* Servico alvo */}
          {serviceOpts.length > 0 && (
            <div className="mb-6">
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
                Serviço alvo
              </label>
              {serviceOpts.length === 1 ? (
                <div className="flex items-center gap-2 rounded-xl border border-border-2 bg-surface-2 px-4 py-3 text-[14px] font-semibold text-ink-2">
                  {SERVICE_META[serviceOpts[0]].label}
                  <span className="text-[12px] font-medium text-faint">
                    (definido no seu perfil)
                  </span>
                </div>
              ) : (
                <ServiceToggle value={service} options={serviceOpts} onChange={setService} />
              )}
            </div>
          )}

          {/* Botao */}
          <button
            type="button"
            onClick={() => void handleBuscar()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2.5 rounded-[14px] p-4 text-[15px] font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
            style={{ background: "var(--grad)" }}
          >
            {saving ? (
              <Spinner size={18} className="animate-spin" />
            ) : (
              <MagnifyingGlass size={18} weight="bold" />
            )}
            {saving ? "Disparando busca..." : "Buscar agora"}
          </button>

          {/* Acompanhamento ao vivo da busca */}
          {searching && (
            <div
              className="mt-4 rounded-[13px] border border-brand/30 bg-brand-50 px-4 py-3.5"
              style={{ animation: "fadeUp .4s both" }}
            >
              <div className="flex items-center gap-2.5">
                <Spinner size={18} className="animate-spin text-brand" />
                <strong className="text-[14px] text-ink">Garimpando negócios...</strong>
                <button
                  type="button"
                  onClick={() => setSearching(false)}
                  className="ml-auto text-[12px] font-semibold text-faint transition-colors hover:text-ink"
                >
                  parar de acompanhar
                </button>
              </div>
              <div className="mt-3 flex gap-7 text-[13.5px] text-ink-2">
                <span>
                  <strong className="text-[18px] text-ink">{found.novos}</strong> negócios novos
                </span>
                <span>
                  <strong className="text-[18px] text-ink">{found.prontos}</strong> prontos pra
                  revisar
                </span>
              </div>
              {found.prontos > 0 && (
                <Link
                  href="/fila"
                  className="mt-3 inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand hover:underline"
                >
                  Ver na fila <ArrowRight size={14} weight="bold" />
                </Link>
              )}
              <p className="mt-2.5 text-[12px] text-faint">
                A busca roda no servidor (1-2 min). Pode sair daqui: os leads continuam chegando na
                sua fila.
              </p>
            </div>
          )}

          {/* Nota informativa */}
          {!searching && (
            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-faint">
              <Info size={14} />
              A busca roda no servidor e leva 1-2 minutos. Aqui você define o alvo e acompanha a
              chegada dos leads.
            </div>
          )}
        </div>

        {/* Coluna direita: mapa de cobertura */}
        <div className="fu rounded-[20px] border border-border bg-card p-7 shadow-[var(--shadow)]">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[17px] font-bold">Cobertura por região</div>
            {city && (
              <span className="text-[12px] font-semibold text-faint">
                {neighborhood.trim()
                  ? `${neighborhood.trim()} — ${city}${uf ? ` / ${uf}` : ""}`
                  : uf
                    ? `${city} / ${uf}`
                    : city}
              </span>
            )}
          </div>
          <p className="mb-5 text-[13.5px] text-muted-foreground">
            O garimpo cobre o mapa em ordem, sem pular pedaço. Veja o que já foi varrido na cidade
            escolhida e o que falta.
          </p>

          {/* Filtro de nicho no mapa */}
          <div className="mb-3">
            <Dropdown
              value={mapNiche ?? ""}
              onChange={(v) => setMapNiche(v || undefined)}
              ariaLabel="Filtrar ramo no mapa"
              options={[
                { value: "", label: "Todos os ramos" },
                ...nicheOptions.map((n) => ({ value: n, label: n })),
              ]}
            />
          </div>

          {/* Mapa */}
          <div
            className="mb-3 overflow-hidden rounded-[14px] border border-border bg-[var(--inset)]"
            style={{ height: "290px" }}
          >
            <CoverageMap
              key={mapKey}
              zones={covFiltered}
              centerLat={mapCenter.lat}
              centerLng={mapCenter.lng}
              zoom={mapCenter.zoom}
              cityName={city || undefined}
              stateName={uf || undefined}
              neighborhood={neighborhood.trim() || undefined}
              radiusKm={radiusKm}
            />
          </div>

          {/* Legenda */}
          <div className="mb-5 flex gap-4 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: "#7C3AED" }}
              />
              Alto (70%+)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: "#9B6BE8" }}
              />
              Médio (30-69%)
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: "#C4A8F0" }}
              />
              Iniciando
            </span>
            <span className="flex items-center gap-1.5">
              <span
                className="h-[11px] w-[11px] rounded-[3px]"
                style={{ background: "#b9b2c4" }}
              />
              Ainda não
            </span>
          </div>

          {/* Barras por zona */}
          {covFiltered.length === 0 ? (
            <div className="flex flex-col items-center gap-3 rounded-[14px] border border-dashed border-border-2 py-10 text-center">
              <MapTrifold size={36} className="text-faint" />
              <div className="text-[14px] font-semibold text-ink">
                {city ? "Nenhuma zona varrida nessa cidade" : "Nenhuma zona varrida ainda"}
              </div>
              <p className="max-w-[300px] text-[13px] text-muted-foreground">
                Clique em <strong>Buscar agora</strong> pra disparar o garimpo nessa região e
                começar a cobrir o mapa.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {covFiltered.map((z) => {
                const zonaLabel =
                  (z.region_name ?? z.region_key) + (z.niche ? ` / ${z.niche}` : "");
                const color = pctColor(z.pct);
                return (
                  <div key={z.id}>
                    <div className="mb-1.5 flex items-center justify-between text-[13.5px]">
                      <span className="font-semibold text-ink-2">{zonaLabel}</span>
                      <span className="text-faint">
                        {z.pct}%{" "}
                        <span className="text-[12px]">({z.result_count} leads)</span>
                      </span>
                    </div>
                    <div className="h-[7px] overflow-hidden rounded-full bg-[var(--inset)]">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${z.pct}%`, background: color }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
