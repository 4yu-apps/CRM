// Geocode gratuito e sem chave usando o Nominatim do OpenStreetMap.
// Serve pra centralizar o mapa na cidade escolhida (estado -> cidade).
//
// Tudo degrada com graca: se a rede falhar, a API nao achar a cidade ou
// devolver algo estranho, retornamos null e quem chama mantem o mapa onde
// estava, sem quebrar nada.

export interface GeoPoint {
  lat: number;
  lng: number;
}

// Centroides aproximados das 27 UFs. Offline e instantaneo: serve pra mover o
// mapa quando o usuario escolhe so o estado (ainda sem cidade), respondendo ao
// pedido de "ao selecionar o estado, o mapa reagir".
export const UF_CENTERS: Record<string, GeoPoint> = {
  AC: { lat: -8.77, lng: -70.55 },
  AL: { lat: -9.57, lng: -36.78 },
  AP: { lat: 1.0, lng: -52.0 },
  AM: { lat: -4.15, lng: -64.0 },
  BA: { lat: -12.5, lng: -41.7 },
  CE: { lat: -5.2, lng: -39.53 },
  DF: { lat: -15.83, lng: -47.86 },
  ES: { lat: -19.5, lng: -40.6 },
  GO: { lat: -16.0, lng: -49.8 },
  MA: { lat: -5.0, lng: -45.3 },
  MT: { lat: -12.64, lng: -55.42 },
  MS: { lat: -20.5, lng: -54.6 },
  MG: { lat: -18.5, lng: -44.5 },
  PA: { lat: -4.0, lng: -52.5 },
  PB: { lat: -7.2, lng: -36.7 },
  PR: { lat: -24.6, lng: -51.6 },
  PE: { lat: -8.4, lng: -37.9 },
  PI: { lat: -7.5, lng: -42.7 },
  RJ: { lat: -22.2, lng: -42.6 },
  RN: { lat: -5.8, lng: -36.6 },
  RS: { lat: -29.8, lng: -53.2 },
  RO: { lat: -10.9, lng: -63.3 },
  RR: { lat: 2.0, lng: -61.4 },
  SC: { lat: -27.3, lng: -50.5 },
  SP: { lat: -22.2, lng: -48.6 },
  SE: { lat: -10.6, lng: -37.4 },
  TO: { lat: -10.2, lng: -48.3 },
};

// Centro aproximado de uma UF (sigla). null se a sigla nao for reconhecida.
export function stateCenter(uf: string | null | undefined): GeoPoint | null {
  if (!uf) return null;
  return UF_CENTERS[uf.trim().toUpperCase()] ?? null;
}

const NOMINATIM = "https://nominatim.openstreetmap.org/search";

// Geocodifica uma cidade brasileira a partir do nome da cidade e da UF.
// Ex: geocodeCity("Maringa", "PR"). Sem cidade, nao ha o que buscar.
export async function geocodeCity(
  city: string,
  uf?: string | null,
): Promise<GeoPoint | null> {
  const cidade = city.trim();
  if (!cidade) return null;

  const params = new URLSearchParams({
    city: cidade,
    country: "Brazil",
    format: "json",
    limit: "1",
  });
  const estado = uf?.trim();
  if (estado) params.set("state", estado);

  try {
    const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: {
        // O Nominatim exige um User-Agent identificavel por politica de uso.
        "User-Agent": "garimpo-crm",
        Accept: "application/json",
      },
    });
    if (!res.ok) return null;

    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return null;

    const first = data[0] as { lat?: unknown; lon?: unknown };
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return { lat, lng };
  } catch {
    // Rede caiu, CORS, timeout, o que for: mantem o mapa onde esta.
    return null;
  }
}

// Geocodifica um bairro/zona dentro da cidade pra dar um zoom mais fino no mapa.
// Usa busca livre (q=) porque bairro nao tem campo proprio confiavel no
// Nominatim. Se nao achar o bairro, cai pra cidade — o mapa sempre tem onde
// centrar, nunca fica perdido.
export async function geocodeNeighborhood(
  neighborhood: string,
  city: string,
  uf?: string | null,
): Promise<GeoPoint | null> {
  const bairro = neighborhood.trim();
  if (!bairro) return geocodeCity(city, uf);

  const partes = [bairro, city.trim(), uf?.trim(), "Brazil"].filter(Boolean);
  const params = new URLSearchParams({
    q: partes.join(", "),
    format: "json",
    limit: "1",
  });

  try {
    const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: { "User-Agent": "garimpo-crm", Accept: "application/json" },
    });
    if (!res.ok) return geocodeCity(city, uf);

    const data: unknown = await res.json();
    if (!Array.isArray(data) || data.length === 0) return geocodeCity(city, uf);

    const first = data[0] as { lat?: unknown; lon?: unknown };
    const lat = Number(first.lat);
    const lng = Number(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return geocodeCity(city, uf);

    return { lat, lng };
  } catch {
    return geocodeCity(city, uf);
  }
}

export interface BairroSuggestion {
  name: string;
  lat: number;
  lng: number;
}

// Sugere bairros/zonas de uma cidade conforme o usuario digita, via Nominatim.
// Mesma ideia do autocomplete de cidade, mas escopado na cidade escolhida.
// Cobertura depende do OSM (cidade grande vem completa; cidade pequena pode vir
// pouca coisa) e por isso o campo continua aceitando texto livre. Degrada com
// graca: qualquer erro retorna [].
export async function suggestBairros(
  query: string,
  city: string,
  uf?: string | null,
): Promise<BairroSuggestion[]> {
  const q = query.trim();
  const cidade = city.trim();
  if (q.length < 2 || !cidade) return [];

  const params = new URLSearchParams({
    q: [q, cidade, uf?.trim(), "Brazil"].filter(Boolean).join(", "),
    format: "json",
    addressdetails: "1",
    limit: "10",
    countrycodes: "br",
  });

  try {
    const res = await fetch(`${NOMINATIM}?${params.toString()}`, {
      headers: { "User-Agent": "garimpo-crm", Accept: "application/json" },
    });
    if (!res.ok) return [];

    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];

    const seen = new Set<string>();
    const out: BairroSuggestion[] = [];
    for (const item of data as Array<{
      lat?: unknown;
      lon?: unknown;
      address?: Record<string, string>;
    }>) {
      const a = item.address ?? {};
      const nome =
        a.suburb || a.neighbourhood || a.quarter || a.city_district || a.residential || a.hamlet;
      if (!nome) continue;
      const key = nome.toLowerCase();
      if (seen.has(key)) continue;
      const lat = Number(item.lat);
      const lng = Number(item.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      seen.add(key);
      out.push({ name: nome, lat, lng });
      if (out.length >= 6) break;
    }
    return out;
  } catch {
    return [];
  }
}
