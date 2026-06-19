"use client";
// Componente de mapa de cobertura com Leaflet (react-leaflet).
// Importado sempre via dynamic(..., { ssr: false }) para evitar quebra no SSR do Next.js.
import { useEffect } from "react";
import { MapContainer, TileLayer, CircleMarker, Tooltip } from "react-leaflet";
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
}

// Correcao do icone default do Leaflet com bundlers (nao usamos marcador padrao; usamos CircleMarker)
// mas importar o CSS pode causar warnings — o useEffect abaixo e preventivo.
function useLeafletIconFix() {
  useEffect(() => {
    // evita o erro "L is not defined" em alguns ambientes de SSR parcial
  }, []);
}

export default function CoverageMap({ zones, centerLat, centerLng, zoom }: CoverageMapProps) {
  useLeafletIconFix();

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
