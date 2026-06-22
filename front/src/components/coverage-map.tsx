"use client";
// Componente de mapa de cobertura com Leaflet (react-leaflet).
// Importado sempre via dynamic(..., { ssr: false }) para evitar quebra no SSR do Next.js.
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import type { ScanCoverage } from "@/lib/types";

// Paleta de cobertura: alta -> media -> baixa
function coverageColor(pct: number): string {
  if (pct >= 70) return "#7C3AED";
  if (pct >= 30) return "#9B6BE8";
  if (pct > 0) return "#C4A8F0";
  return "#b9b2c4";
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
  // Raio de atuacao em km (para desenhar circulo visual)
  radiusKm?: number;
}

// Converte o valor do campo radius ("10km", "25km", "cidade") para metros.
function radiusToMeters(r: string | undefined): number | null {
  if (!r || r === "cidade") return null;
  const m = /^(\d+)km$/i.exec(r);
  if (!m) return null;
  return parseInt(m[1], 10) * 1000;
}

// Sub-componente que reage a mudancas de centro/zoom sem remontar o MapContainer.
// O MapContainer usa center/zoom apenas na montagem; para recentrar usamos flyTo.
function MapController({
  lat,
  lng,
  zoom,
}: {
  lat: number;
  lng: number;
  zoom: number;
}) {
  const map = useMap();
  useEffect(() => {
    map.flyTo([lat, lng], zoom, { duration: 0.8 });
  }, [map, lat, lng, zoom]);
  return null;
}

// Marcador de texto (DivIcon) para mostrar o nome da cidade/estado no mapa.
function CityLabel({
  lat,
  lng,
  label,
}: {
  lat: number;
  lng: number;
  label: string;
}) {
  const map = useMap();
  useEffect(() => {
    const icon = L.divIcon({
      className: "",
      html: `<div style="
        background: rgba(255,255,255,0.92);
        border: 1.5px solid #7C3AED;
        border-radius: 8px;
        padding: 3px 8px;
        font-size: 12px;
        font-weight: 700;
        color: #4B2DA0;
        white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,0.18);
        pointer-events: none;
      ">${label}</div>`,
      iconAnchor: [0, 0],
    });
    const marker = L.marker([lat, lng], { icon, interactive: false }).addTo(map);
    return () => {
      marker.remove();
    };
  }, [map, lat, lng, label]);
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
  radiusKm,
}: CoverageMapProps) {
  useLeafletIconFix();

  const hasCityCoord = centerLat !== -14.235 || centerLng !== -51.925;
  const radiusMeters = radiusToMeters(
    radiusKm !== undefined ? `${radiusKm}km` : undefined,
  );

  // Label do mapa: cidade (UF) se tiver cidade, ou so o estado
  const mapLabel = cityName
    ? stateName
      ? `${cityName} (${stateName})`
      : cityName
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
      <TileLayer
        url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
        maxZoom={19}
        attribution="Tiles &copy; Esri"
      />

      {/* Reage a mudancas de centro/zoom via flyTo */}
      <MapController lat={centerLat} lng={centerLng} zoom={zoom} />

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

      {/* Label de cidade/estado no mapa */}
      {hasCityCoord && mapLabel && (
        <CityLabel lat={centerLat} lng={centerLng} label={mapLabel} />
      )}

      {zones.map((z) => {
        if (z.center_lat == null || z.center_lng == null) return null;
        const color = coverageColor(z.pct);
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
            }}
          >
            <Tooltip direction="top" sticky>
              <span style={{ fontSize: "12px", fontWeight: 600 }}>
                {label} &bull; {z.pct}% coberto ({z.result_count} leads)
              </span>
            </Tooltip>
          </CircleMarker>
        );
      })}
    </MapContainer>
  );
}
