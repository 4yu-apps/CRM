// Sugestoes de busca derivadas dos dados reais do usuario.
// Agrupa por category + city (e opcionalmente service_target),
// ranqueia por taxa de fechamento, retorna top N.
import type { Lead } from "./types";
import type { ServiceTarget } from "./types";
import { kpis } from "./funnel";

export interface SearchSuggestion {
  niche?: string;
  city?: string;
  uf?: string;
  service?: ServiceTarget;
  label: string;
  fechados: number;
  enviados: number;
}

const MIN_ENVIADOS = 3; // minimo de enviados pra um grupo contar
const TOP_N = 3;

/** Monta label legivel tipo "Barbearias em Maringa". */
function buildLabel(niche: string | undefined, city: string | undefined): string {
  if (niche && city) return `${niche} em ${city}`;
  if (niche) return niche;
  if (city) return `Leads em ${city}`;
  return "Leads";
}

/**
 * Sugere as proximas buscas com base nos dados reais do usuario.
 * Agrupa por nicho (category) + cidade, ranqueia por taxa de fechamento.
 * Exige MIN_ENVIADOS enviados no grupo pra evitar noise com poucos dados.
 */
export function suggestSearches(leads: Lead[]): SearchSuggestion[] {
  // Agrupa por "category|city"
  const groups = new Map<string, Lead[]>();
  for (const l of leads) {
    const niche = (l.category ?? "").trim();
    const city = (l.city ?? "").trim();
    if (!niche && !city) continue; // sem dimensao util, ignora
    const key = `${niche}|${city}`;
    const arr = groups.get(key) ?? [];
    arr.push(l);
    groups.set(key, arr);
  }

  const scored: SearchSuggestion[] = [];

  for (const [key, ls] of groups) {
    const [niche, city] = key.split("|");
    const k = kpis(ls);
    if (k.enviados < MIN_ENVIADOS) continue;

    // pega o estado do primeiro lead que tiver (para preencher uf)
    const uf = ls.find((l) => l.state?.trim())?.state?.trim();

    // pega o service_target mais frequente no grupo (multi-servico: respeita o que converte)
    const svCounts = new Map<ServiceTarget, number>();
    for (const l of ls) {
      svCounts.set(l.service_target, (svCounts.get(l.service_target) ?? 0) + 1);
    }
    let topService: ServiceTarget | undefined;
    let topCount = 0;
    for (const [sv, cnt] of svCounts) {
      if (cnt > topCount) { topService = sv; topCount = cnt; }
    }

    scored.push({
      niche: niche || undefined,
      city: city || undefined,
      uf,
      service: topService,
      label: buildLabel(niche || undefined, city || undefined),
      fechados: k.fechados,
      enviados: k.enviados,
    });
  }

  // Ordena: taxa de fechamento desc; desempata por taxa de resposta, depois por enviados
  scored.sort((a, b) => {
    const txA = a.enviados ? a.fechados / a.enviados : 0;
    const txB = b.enviados ? b.fechados / b.enviados : 0;
    if (txB !== txA) return txB - txA;
    return b.enviados - a.enviados;
  });

  return scored.slice(0, TOP_N);
}
