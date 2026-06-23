// Links de "conferir" um lead em fontes externas. Servem pra puxar info
// complementar (e checar se o negocio anuncia) antes de abordar, caindo sempre
// NAQUELE negocio (nome + cidade/UF deixam a busca assertiva).
import type { Lead } from "./types";

function clean(s: string | null | undefined): string {
  return (s ?? "").trim();
}

function nomeCidade(lead: Pick<Lead, "business_name" | "city" | "state">): string {
  return [clean(lead.business_name), clean(lead.city), clean(lead.state)].filter(Boolean).join(" ");
}

// Google pesquisado pelo negocio + cidade/UF.
export function googleSearchUrl(lead: Pick<Lead, "business_name" | "city" | "state">): string {
  return `https://www.google.com/search?q=${encodeURIComponent(nomeCidade(lead))}`;
}

// Google Maps: usa a URL/place_id do Maps quando tem; senao pesquisa por nome+cidade.
export function googleMapsUrl(
  lead: Pick<Lead, "business_name" | "city" | "state" | "maps_url" | "maps_place_id">,
): string {
  if (clean(lead.maps_url)) return lead.maps_url as string;
  const base = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(nomeCidade(lead))}`;
  return lead.maps_place_id ? `${base}&query_place_id=${encodeURIComponent(lead.maps_place_id)}` : base;
}

// Biblioteca de Anuncios da Meta, ja pesquisada pelo negocio: a forma sem API de
// descobrir se o lead anuncia (abre o site publico, sem login).
export function metaAdsUrl(lead: Pick<Lead, "business_name" | "instagram">): string | undefined {
  const term = (lead.business_name || lead.instagram || "").replace(/^@/, "").trim();
  if (!term) return undefined;
  const p = new URLSearchParams({
    active_status: "all",
    ad_type: "all",
    country: "BR",
    q: term,
    search_type: "keyword_unordered",
    media_type: "all",
  });
  return `https://www.facebook.com/ads/library/?${p.toString()}`;
}
