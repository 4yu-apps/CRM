"use client";
import { useEffect, useState, useCallback } from "react";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import {
  Check,
  Info,
  MagnifyingGlass,
  MapTrifold,
  Robot,
  Spinner,
} from "@phosphor-icons/react";
import { getRepo } from "@/lib/repo";
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

const NICHE_OPTIONS = [
  "Hamburgueria",
  "Barbearia",
  "Estetica",
  "Restaurante",
  "Petshop",
  "Academia",
  "Odontologia",
  "Cafeteria",
  "Confeitaria",
  "Auto Spa",
  "Pilates",
  "Yoga",
];

const RADIUS_OPTIONS = [
  { value: "5km", label: "Ate 5 km" },
  { value: "10km", label: "Ate 10 km" },
  { value: "25km", label: "Ate 25 km" },
  { value: "50km", label: "Ate 50 km" },
  { value: "cidade", label: "Cidade toda" },
];

function pctColor(pct: number): string {
  if (pct >= 70) return "#7C3AED";
  if (pct >= 30) return "#9B6BE8";
  if (pct > 0) return "#C4A8F0";
  return "#b9b2c4";
}

function ServiceToggle({
  value,
  onChange,
}: {
  value: ServiceTarget;
  onChange: (v: ServiceTarget) => void;
}) {
  const opts: { v: ServiceTarget; label: string }[] = [
    { v: "trafego", label: "Trafego" },
    { v: "automacao", label: "Automacao" },
    { v: "ambos", label: "Ambos" },
  ];
  return (
    <div className="flex overflow-hidden rounded-xl border border-border-2">
      {opts.map((o) => (
        <button
          key={o.v}
          type="button"
          onClick={() => onChange(o.v)}
          className={cn(
            "flex-1 py-2.5 text-sm font-semibold transition-colors",
            value === o.v
              ? "text-white"
              : "bg-surface-2 text-muted-foreground hover:bg-brand-50 hover:text-brand",
          )}
          style={value === o.v ? { background: "var(--grad)" } : undefined}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function AutopilotToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={cn(
        "relative h-7 w-12 flex-none rounded-full border-none transition-all",
        value ? "" : "bg-[var(--inset)]",
      )}
      style={value ? { background: "var(--grad)" } : undefined}
    >
      <span
        className={cn(
          "absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow transition-all",
          value ? "left-[22px]" : "left-[3px]",
        )}
      />
    </button>
  );
}

export default function BuscarPage() {
  const repo = getRepo();

  const [profile, setProfile] = useState<SearchProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [coverage, setCoverage] = useState<ScanCoverage[]>([]);

  // Campos do formulario
  const [niche, setNiche] = useState("");
  const [city, setCity] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [radius, setRadius] = useState("10km");
  const [service, setService] = useState<ServiceTarget>("trafego");
  const [autopilot, setAutopilot] = useState(false);

  // Estado de submit
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Filtro de nicho no mapa
  const [mapNiche, setMapNiche] = useState<string | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [p, cov] = await Promise.all([repo.getProfile(), repo.listCoverage()]);
      if (p) {
        setProfile(p);
        setNiche(p.niches[0] ?? "");
        setCity(p.city ?? "");
        setRadius(p.radius ?? "10km");
        setService(p.default_service_target ?? "trafego");
        setAutopilot(p.autopilot ?? false);
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

  const handleSave = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    setSaved(false);
    try {
      await repo.saveProfile({
        niches: niche ? [niche] : profile?.niches ?? [],
        city: city || null,
        radius,
        default_service_target: service,
        autopilot,
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 4000);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar alvo");
    } finally {
      setSaving(false);
    }
  }, [saving, repo, niche, profile, city, radius, service, autopilot]);

  // Coordenadas para o mapa
  const mapCenter = (() => {
    const first = coverage.find((c) => c.center_lat != null && c.center_lng != null);
    if (first) return { lat: first.center_lat!, lng: first.center_lng!, zoom: 12 };
    if (profile?.city) return BRASIL_CENTER;
    return BRASIL_CENTER;
  })();

  const covFiltered = coverage;

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
            A captacao roda pela extensao no Google Maps e pelo piloto automatico. Aqui voce define o
            alvo e acompanha a cobertura.
          </p>

          {/* Ramo */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Ramo
            </label>
            <select
              value={niche}
              onChange={(e) => setNiche(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3.5 text-[14.5px] text-ink outline-none focus:border-brand"
            >
              <option value="">Qualquer ramo</option>
              {NICHE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Cidade + Bairro/zona */}
          <div className="mb-4 grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
                Cidade
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Ex: Maringa"
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3.5 text-[14.5px] text-ink outline-none focus:border-brand"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
                Bairro ou zona
              </label>
              <input
                value={neighborhood}
                onChange={(e) => setNeighborhood(e.target.value)}
                placeholder="Ex: Zona 7"
                className="w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3.5 text-[14.5px] text-ink outline-none focus:border-brand"
              />
            </div>
          </div>

          {/* Raio */}
          <div className="mb-4">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Raio de atuacao
            </label>
            <select
              value={radius}
              onChange={(e) => setRadius(e.target.value)}
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-4 py-3.5 text-[14.5px] text-ink outline-none focus:border-brand"
            >
              {RADIUS_OPTIONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>

          {/* Servico alvo */}
          <div className="mb-6">
            <label className="mb-1.5 block text-[12px] font-bold uppercase tracking-wider text-faint">
              Servico alvo
            </label>
            <ServiceToggle value={service} onChange={setService} />
          </div>

          {/* Piloto automatico */}
          <div className="mb-6 flex items-center justify-between gap-4 rounded-[14px] border border-border bg-surface-2 px-5 py-4">
            <div>
              <div className="flex items-center gap-2 text-[14.5px] font-bold text-ink">
                <Robot size={17} className="text-brand" />
                Piloto automatico
              </div>
              <div className="mt-0.5 text-[12.5px] text-muted-foreground">
                Cobre o mapa em ordem e enche a fila sem voce precisar pedir.
              </div>
            </div>
            <AutopilotToggle value={autopilot} onChange={setAutopilot} />
          </div>

          {/* Botao */}
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="flex w-full items-center justify-center gap-2.5 rounded-[14px] p-4 text-[15px] font-bold text-white shadow-[0_6px_16px_var(--ring)] transition-transform hover:-translate-y-0.5 disabled:opacity-70"
            style={{ background: "var(--grad)" }}
          >
            {saving ? (
              <Spinner size={18} className="animate-spin" />
            ) : (
              <MagnifyingGlass size={18} weight="bold" />
            )}
            {saving ? "Salvando alvo..." : "Buscar agora"}
          </button>

          {/* Feedback honesto apos salvar */}
          {saved && (
            <div
              className="mt-4 flex items-start gap-3 rounded-[13px] border border-success/30 bg-success-bg px-4 py-3.5"
              style={{ animation: "fadeUp .4s both" }}
            >
              <Check size={18} className="mt-0.5 flex-none text-success" weight="bold" />
              <div className="text-[13.5px] text-ink-2">
                <strong className="text-ink">Alvo salvo.</strong> A captacao roda pela extensao no
                Google Maps e pelo piloto automatico quando ligado. Os leads novos chegam direto na
                fila pra voce revisar.
              </div>
            </div>
          )}

          {/* Nota informativa sempre visivel */}
          <div className="mt-4 flex items-center gap-2 text-[12.5px] text-faint">
            <Info size={14} />
            A busca nao roda aqui no front. O front define o alvo e mostra a cobertura.
          </div>
        </div>

        {/* Coluna direita: mapa de cobertura */}
        <div className="fu rounded-[20px] border border-border bg-card p-7 shadow-[var(--shadow)]">
          <div className="mb-1 flex items-center justify-between">
            <div className="text-[17px] font-bold">Cobertura por regiao</div>
            {city && (
              <span className="text-[12px] font-semibold text-faint">{city}</span>
            )}
          </div>
          <p className="mb-5 text-[13.5px] text-muted-foreground">
            O garimpo cobre o mapa em ordem, sem pular pedaco. Veja o que ja foi varrido e o que
            falta.
          </p>

          {/* Filtro de nicho no mapa */}
          <div className="mb-3">
            <select
              value={mapNiche ?? ""}
              onChange={(e) => setMapNiche(e.target.value || undefined)}
              className="w-full rounded-xl border border-border-2 bg-surface-2 px-3 py-2.5 text-[13.5px] text-ink outline-none focus:border-brand"
            >
              <option value="">Todos os ramos</option>
              {NICHE_OPTIONS.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>

          {/* Mapa */}
          <div
            className="mb-3 overflow-hidden rounded-[14px] border border-border bg-[var(--inset)]"
            style={{ height: "290px" }}
          >
            <CoverageMap
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
              <div className="text-[14px] font-semibold text-ink">Nenhuma zona varrida ainda</div>
              <p className="max-w-[300px] text-[13px] text-muted-foreground">
                Rode a captacao pela extensao ou ligue o piloto automatico pra comecar a cobrir o
                mapa.
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
