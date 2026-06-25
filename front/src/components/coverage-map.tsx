"use client";
// Componente de mapa de cobertura com Leaflet (react-leaflet).
// Importado sempre via dynamic(..., { ssr: false }) para evitar quebra no SSR do Next.js.
import { useEffect, useRef } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Circle, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import type { ScanCoverage } from "@/lib/types";

// Paleta de cobertura: alta -> media -> baixa
function coverageColor(pct: number): string {
  if (pct >= 70) return "#7C3AED";
  if (pct >= 30) return "#9B6BE8";
  if (pct > 0) return "#C4A8F0";
  return "#b9b2c4";
}

// Segundo sinal alem da cor (acessibilidade para daltonicos): cada nivel de
// cobertura ganha um glifo e um padrao de borda distintos. Assim os niveis se
// distinguem sem depender da cor.
function coverageGlyph(pct: number): string {
  if (pct >= 70) return "◉"; // circulo preenchido com anel
  if (pct >= 30) return "◐"; // meio circulo
  if (pct > 0) return "○"; // circulo vazado
  return "×"; // x (ainda nao varrido)
}

// Padrao de tracejado da borda por nivel (reforca o sinal nao-cromatico).
function coverageDash(pct: number): string | undefined {
  if (pct >= 70) return undefined; // borda solida
  if (pct >= 30) return "6 3"; // tracejado medio
  if (pct > 0) return "2 3"; // pontilhado
  return "1 4"; // pontilhado fino
}

interface CoverageMapProps {
  zones: ScanCoverage[];
  centerLat: number;
  centerLng: number;
  zoom: number;
  // Nome da cidade selecionada (para label no mapa)
  cityName?: string;
  // Sigla do estado selecionado (para label no mapa)
  stateName?: string;
  // Bairro/zona selecionado (entra no label e e o centro do raio)
  neighborhood?: string;
  // Raio de atuacao em km (para desenhar circulo visual)
  radiusKm?: number;
}

// Sub-componente que reage a mudancas de centro/zoom sem remontar o MapContainer.
// O MapContainer usa center/zoom apenas na montagem; para recentrar usamos flyTo.
function MapController({
  lat,
  lng,
  zoom,
  radiusMeters,
  focusNeighborhood,
}: {
  lat: number;
  lng: number;
  zoom: number;
  radiusMeters: number | null;
  focusNeighborhood: boolean;
}) {
  const map = useMap();
  const first = useRef(true);
  useEffect(() => {
    // 1a renderizacao = instantanea (mata a "louqueada" de zoom out/in na
    // montagem); trocas seguintes de cidade/bairro animam suave.
    const animate = !first.current;
    first.current = false;

    if (focusNeighborhood) {
      // Bairro escolhido: foca NO bairro (nivel de rua), nao enquadra os 10km
      // inteiros da cidade. O circulo do raio continua sendo desenhado a partir
      // daqui (centrado no bairro).
      map.setView([lat, lng], Math.max(zoom, 14), { animate });
      return;
    }
    if (radiusMeters && radiusMeters > 0) {
      // Sem bairro: enquadra o raio inteiro a partir da cidade (5km de perto,
      // 50km abre mais).
      const latDelta = radiusMeters / 111320;
      const lngDelta = radiusMeters / (111320 * Math.cos((lat * Math.PI) / 180));
      map.flyToBounds(
        [
          [lat - latDelta, lng - lngDelta],
          [lat + latDelta, lng + lngDelta],
        ],
        { padding: [16, 16], maxZoom: 15, animate, duration: animate ? 0.6 : 0 },
      );
      return;
    }
    map.setView([lat, lng], zoom, { animate });
  }, [map, lat, lng, zoom, radiusMeters, focusNeighborhood]);
  return null;
}

// Correcao do icone default do Leaflet com bundlers
function useLeafletIconFix() {
  useEffect(() => {
    // evita o erro "L is not defined" em alguns ambientes de SSR parcial
  }, []);
}

export default function CoverageMap({
  zones,
  centerLat,
  centerLng,
  zoom,
  cityName,
  stateName,
  neighborhood,
  radiusKm,
}: CoverageMapProps) {
  useLeafletIconFix();

  const hasCityCoord = centerLat !== -14.235 || centerLng !== -51.925;
  const radiusMeters = radiusKm != null && radiusKm > 0 ? radiusKm * 1000 : null;

  // Label do mapa: "Bairro, Cidade - UF" (com bairro quando houver), ou so o estado.
  const mapLabel = cityName
    ? `${neighborhood ? `${neighborhood}, ` : ""}${cityName}${stateName ? ` - ${stateName}` : ""}`
    : stateName
      ? stateName
      : null;

  return (
    <MapContainer
      center={[centerLat, centerLng]}
      zoom={zoom}
      scrollWheelZoom={false}
      style={{ width: "100%", height: "100%", borderRadius: "inherit" }}
    >
      {/* Neutraliza a bolha padrao do Leaflet no glifo central (so o simbolo aparece) */}
      <style>{`.coverage-glyph-tip{background:transparent;border:none;box-shadow:none;padding:0;}.coverage-glyph-tip::before{display:none;}`}</style>
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        attribution="Tiles &copy; Esri"
      />

      {/* Reage a mudancas de centro/zoom via flyTo */}
      <MapController
        lat={centerLat}
        lng={centerLng}
        zoom={zoom}
        radiusMeters={radiusMeters}
        focusNeighborhood={!!neighborhood}
      />

      {/* Circulo de raio de atuacao centrado na cidade */}
      {hasCityCoord && radiusMeters !== null && (
        <Circle
          center={[centerLat, centerLng]}
          radius={radiusMeters}
          pathOptions={{
            color: "#7C3AED",
            weight: 2,
            fillColor: "#7C3AED",
            fillOpacity: 0.08,
            dashArray: "6 4",
          }}
        />
      )}

      {/* Pin do centro (cidade/estado) com rotulo legivel acima dele */}
      {hasCityCoord && (
        <CircleMarker
          center={[centerLat, centerLng]}
          radius={8}
          pathOptions={{ color: "#ffffff", weight: 3, fillColor: "#7C3AED", fillOpacity: 1 }}
        >
          {mapLabel && (
            <Tooltip permanent direction="top" offset={[0, -10]}>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "#2A1A5E" }}>{mapLabel}</span>
            </Tooltip>
          )}
        </CircleMarker>
      )}

      {zones.map((z) => {
        if (z.center_lat == null || z.center_lng == null) return null;
        const color = coverageColor(z.pct);
        const glyph = coverageGlyph(z.pct);
        const dash = coverageDash(z.pct);
        const label = (z.region_name ?? z.region_key) + (z.niche ? ` / ${z.niche}` : "");
        return (
          <CircleMarker
            key={z.id}
            center={[z.center_lat, z.center_lng]}
            radius={18}
            pathOptions={{
              color,
              weight: 2,
              fillColor: color,
              fillOpacity: 0.32,
              dashArray: dash,
            }}
          >
            {/* Glifo central: segundo sinal alem da cor para daltonicos */}
            <Tooltip
              permanent
              direction="center"
              className="coverage-glyph-tip"
              opacity={1}
            >
              <span
                aria-hidden="true"
                style={{ fontSize: "15px", fontWeight: 700, color, lineHeight: 1 }}
              >
                {glyph}
              </span>
            </Tooltip>
            <Tooltip direction="top" sticky>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>
                {glyph} {label} &bull; {z.pct}% coberto ({z.result_count} leads)
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
