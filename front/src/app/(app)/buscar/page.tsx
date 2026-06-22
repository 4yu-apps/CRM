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
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
import { fetchEstados, fetchMunicipios, type Municipio, type UF } from "@/lib/ibge";
import { geocodeCity, geocodeNeighborhood, type GeoPoint } from "@/lib/geocode";
import { serviceOptionsForProfile } from "@/lib/professions";
import { SERVICE_META } from "@/lib/service";
import { RAMOS_DISPONIVEIS } from "@/lib/ramos";
import { Dropdown } from "@/components/dropdown";
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
  { value: "5km", label: "Ate 5 km" },
  { value: "10km", label: "Ate 10 km" },
  { value: "25km", label: "Ate 25 km" },
  { value: "50km", label: "Ate 50 km" },
  { value: "cidade", label: "Cidade toda" },
];

// Chave de regiao igual a do robo (autopilot.region_key): cidade + estado sem
// acento. Usada pra filtrar a cobertura pela cidade escolhida na tela.
function slugRegion(city: string | null, state: string | null): string {
  const base = `${city ?? ""} ${state ?? ""}`
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
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

// Toggle de servico-alvo. As opcoes vem do perfil (serviceOptionsForProfile):
// quem faz "ambos" ve as 3; perfis de servico unico nem chegam aqui (mostram
// rotulo fixo); perfis "indefinido" escondem o controle.
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

export default function BuscarPage() {
  const repo = getRepo();

  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<ScanCoverage[]>([]);

  // Campos do formulario
  const [niche, setNiche] = useState("");
  const [uf, setUf] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [radius, setRadius] = useState("10km");
  const [service, setService] = useState<ServiceTarget>("trafego");

  // Listas vindas do IBGE para os selects em cascata
  const [estados, setEstados] = useState<UF[]>([]);
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [loadingCidades, setLoadingCidades] = useState(false);

  // Estado de submit + acompanhamento ao vivo da busca
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [baseline, setBaseline] = useState<{ total: number; ready: number } | null>(null);
  const [found, setFound] = useState<{ novos: number; prontos: number }>({ novos: 0, prontos: 0 });

  // Filtro de nicho no mapa
  const [mapNiche, setMapNiche] = useState<string | undefined>(undefined);

  // Ponto geocodificado da regiao escolhida (cidade ou bairro) pra dar zoom.
  const [cityPoint, setCityPoint] = useState<GeoPoint | null>(null);

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
        setNiche(p.niches[0] ?? "");
        setUf(p.state ?? "");
        setCity(p.city ?? "");
        setNeighborhood(p.neighborhood ?? "");
        setRadius(p.radius ?? "10km");
        // servico-alvo coerente com o perfil
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

  // Carrega a lista de estados do IBGE uma vez, ao montar.
  useEffect(() => {
    fetchEstados().then(setEstados).catch(() => null);
  }, []);

  // Carrega as cidades sempre que a UF muda. Se a UF ficar vazia, limpa a lista.
  useEffect(() => {
    if (!uf) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMunicipios([]);
      return;
    }
    let ativo = true;
    setLoadingCidades(true);
    fetchMunicipios(uf)
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
  }, [uf]);

  // Recentra o mapa em TEMPO REAL conforme estado, cidade ou bairro mudam — sem
  // precisar clicar em buscar. Com bairro, geocodifica o bairro (zoom mais
  // fino); sem bairro, a cidade. O bairro usa debounce porque e campo de texto.
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
    // bairro: espera o usuario parar de digitar; cidade: na hora.
    const t = setTimeout(buscar, bairro ? 600 : 0);
    return () => {
      ativo = false;
      clearTimeout(t);
    };
  }, [city, uf, neighborhood]);

  // Acompanhamento ao vivo: enquanto a busca roda (no servidor), consulta o
  // banco a cada poucos segundos e mostra quantos leads novos chegaram e quantos
  // ja estao prontos pra revisar. Para sozinho depois de um teto de tempo.
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
        // soluco de rede: ignora e tenta de novo no proximo tick
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

  // Troca de estado: recarrega cidades (efeito acima) e limpa a cidade escolhida.
  const handleUfChange = useCallback((novaUf: string) => {
    setUf(novaUf);
    setCity("");
  }, []);

  // Surpreenda-me: randomiza TUDO menos o servico-alvo — estado, cidade, bairro
  // e ramo. Util quando a pessoa quer garimpar uma regiao nova sem pensar.
  const handleSurpreendaMe = useCallback(async () => {
    const pool = profile?.niches?.length ? profile.niches : RAMOS_DISPONIVEIS;
    const ramo = rnd(pool);
    setNiche(ramo);
    setNeighborhood(""); // bairro limpo no sorteio (cobre a cidade toda)

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
      // 1) Marca a linha de base pra medir o que a busca trouxe.
      let base = { total: 0, ready: 0 };
      try {
        const [t, r] = await Promise.all([
          repo.countByStatus(),
          repo.countByStatus("rascunho_pronto"),
        ]);
        base = { total: t, ready: r };
      } catch {
        // sem baseline: o acompanhamento mostra a partir de 0
      }
      setBaseline(base);
      setFound({ novos: 0, prontos: 0 });

      // 2) Salva o alvo. Autopilot nao mora mais aqui (fica no Config); por isso
      // nao mandamos esse campo — o upsert preserva o valor atual.
      await repo.saveProfile({
        niches: niche ? [niche] : profile?.niches ?? [],
        city: city || null,
        state: uf || null,
        neighborhood: neighborhood.trim() || null,
        radius,
        default_service_target: serviceOpts.length === 0 ? "indefinido" : service,
      });

      // 3) Dispara o robo. A busca real roda no servidor (GitHub Actions).
      let ok = false;
      try {
        const res = await fetch("/api/search/run", { method: "POST" });
        const data = (await res.json().catch(() => null)) as
          | { ok: boolean; reason?: string }
          | null;
        ok = !!data?.ok;
      } catch {
        // rede/route indisponivel: cai no proximo ciclo automatico
      }

      // 4) Acompanha os leads chegando de qualquer forma.
      setSearching(true);
      if (ok) {
        toast.success("Busca disparada! Acompanhe os leads chegando aqui embaixo.");
      } else {
        toast.message("Alvo salvo. O robo busca no proximo ciclo — deixei o acompanhamento ligado.");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alvo");
    } finally {
      setSaving(false);
    }
  }, [saving, repo, niche, profile, city, uf, neighborhood, radius, service, serviceOpts]);

  // Coordenadas para o mapa. Prioridade: regiao geocodificada (zoom 12) ->
  // primeira zona de cobertura com coordenada -> centro do Brasil.
  const mapCenter = (() => {
    if (cityPoint) return { lat: cityPoint.lat, lng: cityPoint.lng, zoom: neighborhood.trim() ? 14 : 12 };
    const first = coverage.find((c) => c.center_lat != null && c.center_lng != null);
    if (first) return { lat: first.center_lat!, lng: first.center_lng!, zoom: 12 };
    return BRASIL_CENTER;
  })();

  // O MapContainer do react-leaflet so usa center/zoom na montagem. Trocar a key
  // quando o centro muda remonta o mapa ja na regiao escolhida (recentra de fato).
  const mapKey = `${mapCenter.lat.toFixed(3)},${mapCenter.lng.toFixed(3)},${mapCenter.zoom}`;

  // Cobertura mostrada: filtrada pela cidade escolhida (mesma chave do robo).
  // Sem cidade, mostra tudo.
  const covFiltered = useMemo(() => {
    if (!city) return coverage;
    const key = slugRegion(city, uf);
    return coverage.filter((z) => z.region_key === key);
  }, [coverage, city, uf]);

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
            Escolha onde e o que garimpar e clique em buscar pra disparar na hora. O robo roda no
            servidor e os leads novos vao subindo na sua fila — voce acompanha aqui em tempo real.
          </p>

          {/* Ramo */}
          <div className="mb-4">
            <div className="mb-1.5 flex items-center justify-between">
              <label
                htmlFor="ramo-select"
                className="block text-[12px] font-bold uppercase tracking-wider text-faint"
              >
                Ramo
              </label>
              <button
                type="button"
                onClick={() => void handleSurpreendaMe()}
                title="Sorteia estado, cidade e ramo pra voce garimpar uma regiao nova sem pensar"
                aria-label="Surpreenda-me: sortear regiao e ramo aleatorios"
                className="flex items-center gap-1.5 rounded-full border border-border-2 bg-surface-2 px-3 py-1 text-[12px] font-semibold text-ink-2 transition-colors hover:border-brand hover:bg-brand-50 hover:text-brand"
              >
                <Shuffle size={14} weight="bold" />
                Surpreenda-me
              </button>
            </div>
            <Dropdown
              value={niche}
              onChange={setNiche}
              ariaLabel="Ramo"
              options={[{ value: "", label: "Qualquer ramo" }, ...nicheOptions.map((n) => ({ value: n, label: n }))]}
            />
          </div>

          {/* Estado + Cidade em cascata (dados do IBGE) */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="estado-select"
                className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint"
              >
                Estado
              </label>
              <Dropdown
                value={uf}
                onChange={handleUfChange}
                ariaLabel="Estado"
                placeholder="Escolha o estado"
                options={estados.map((e) => ({ value: e.sigla, label: `${e.nome} (${e.sigla})` }))}
              />
            </div>
            <div>
              <label
                htmlFor="cidade-select"
                className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint"
              >
                Cidade
              </label>
              <Dropdown
                value={city}
                onChange={setCity}
                ariaLabel="Cidade"
                disabled={!uf || loadingCidades}
                placeholder={
                  !uf ? "Escolha o estado antes" : loadingCidades ? "Carregando cidades..." : "Escolha a cidade"
                }
                options={municipios.map((m) => ({ value: m.nome, label: m.nome }))}
              />
            </div>
          </div>

          {/* Bairro ou zona (texto livre, opcional, agora de verdade) */}
          <div className="mb-4">
            <label
              htmlFor="bairro-input"
              className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint"
            >
              Bairro ou zona <span className="font-medium normal-case text-faint">(opcional)</span>
            </label>
            <input
              id="bairro-input"
              value={neighborhood}
              onChange={(e) => setNeighborhood(e.target.value)}
              placeholder="Ex: Zona 7. Em branco = cidade toda."
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3.5 text-[14.5px] text-ink outline-none focus:border-brand"
            />
            <p className="mt-1.5 text-[12px] text-faint">
              O mapa centra no bairro enquanto voce digita, e o robo foca a busca ali.
            </p>
          </div>

          {/* Raio */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Raio de atuacao
            </label>
            <Dropdown value={radius} onChange={setRadius} ariaLabel="Raio de atuacao" options={RADIUS_OPTIONS} />
          </div>

          {/* Servico alvo — reflete a profissao do perfil. */}
          {serviceOpts.length > 0 && (
            <div className="mb-6">
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
                Servico alvo
              </label>
              {serviceOpts.length === 1 ? (
                <div className="flex items-center gap-2 rounded-xl border border-border-2 bg-surface-2 px-4 py-3 text-[14px] font-semibold text-ink-2">
                  {SERVICE_META[serviceOpts[0]].label}
                  <span className="text-[12px] font-medium text-faint">(definido no seu perfil)</span>
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
                <strong className="text-[14px] text-ink">Garimpando negocios...</strong>
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
                  <strong className="text-[18px] text-ink">{found.novos}</strong> negocios novos
                </span>
                <span>
                  <strong className="text-[18px] text-ink">{found.prontos}</strong> prontos pra revisar
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

          {/* Nota informativa sempre visivel */}
          {!searching && (
            <div className="mt-4 flex items-center gap-2 text-[12.5px] text-faint">
              <Info size={14} />
              A busca roda no servidor e leva 1-2 minutos. Aqui voce define o alvo e acompanha a
              chegada dos leads.
            </div>
          )}
        </div>

        {/* Coluna direita: mapa de cobertura */}
        <div className="fu rounded-[20px] border border-border bg-card p-7 shadow-[var(--shadow)]">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[17px] font-bold">Cobertura por regiao</div>
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
            O garimpo cobre o mapa em ordem, sem pular pedaco. Veja o que ja foi varrido na cidade
            escolhida e o que falta.
          </p>

          {/* Filtro de nicho no mapa */}
          <div className="mb-3">
            <Dropdown
              value={mapNiche ?? ""}
              onChange={(v) => setMapNiche(v || undefined)}
              ariaLabel="Filtrar ramo no mapa"
              options={[{ value: "", label: "Todos os ramos" }, ...nicheOptions.map((n) => ({ value: n, label: n }))]}
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
            />
          </div>

          {/* Legenda */}
          <div className="mb-5 flex gap-4 text-[12px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: "#7C3AED" }} />
              Alto (70%+)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: "#9B6BE8" }} />
              Medio (30-69%)
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: "#C4A8F0" }} />
              Iniciando
            </span>
            <span className="flex items-center gap-1.5">
              <span className="h-[11px] w-[11px] rounded-[3px]" style={{ background: "#b9b2c4" }} />
              Ainda nao
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
                Clique em <strong>Buscar agora</strong> pra disparar o garimpo nessa regiao e
                comecar a cobrir o mapa.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-3.5">
              {covFiltered.map((z) => {
                const label =
                  (z.region_name ?? z.region_key) + (z.niche ? ` / ${z.niche}` : "");
                const color = pctColor(z.pct);
                return (
                  <div key={z.id}>
                    <div className="mb-1.5 flex items-center justify-between text-[13.5px]">
                      <span className="font-semibold text-ink-2">{label}</span>
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
