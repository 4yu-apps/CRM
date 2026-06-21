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
