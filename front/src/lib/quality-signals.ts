// #9 — Filtro por sinal de qualidade. Define o angulo de venda: quem ja
// anuncia, quem tem site mas nao anuncia (oportunidade de trafego), quem nao
// tem site, quem tem site lento. Compartilhado por fila e contatos pra ficar
// consistente. Tudo deriva de campos que JA existem no Lead (sem schema).
import type { SignalChip } from "./site-signals";
import type { Lead } from "./types";

export type SignalFilter =
  | ""
  | "ja_anuncia"
  | "nao_anuncia"
  | "sem_site"
  | "site_lento"
  | "sem_chatbot"
  | "sem_agendamento"
  | "tem_loja"
  | "sem_instagram"
  | "ig_parado"
  | "sem_post_recorrente"
  | "baixo_engajamento"
  | "presenca_forte"
  | "gmb_incompleto"
  | "empresa_nova"
  | "situacao_irregular"
  | "tem_socios"
  | "fora_simples"
  | "sem_politica"
  | "reputacao_atrito";

// Cada filtro pertence a uma LENTE. `null` = serve pra todo mundo.
// O gestor de trafego nao precisa ver "sem politica de privacidade" na lista, e
// o advogado nao precisa de "Instagram parado": sao ~20 opcoes num select, e a
// maioria e ruido pra quem esta olhando.
type FilterOption = { value: SignalFilter; label: string; lens: string | null };

const ALL_SIGNAL_FILTERS: FilterOption[] = [
  { value: "", label: "Todos os sinais", lens: null },
  { value: "empresa_nova", label: "Negócio novo (aberto há pouco)", lens: null },
  { value: "ja_anuncia", label: "Tráfego: já anuncia", lens: "trafego" },
  { value: "nao_anuncia", label: "Tráfego: tem site, não anuncia", lens: "trafego" },
  { value: "sem_site", label: "Design: sem site", lens: "design" },
  { value: "site_lento", label: "Design: site lento", lens: "design" },
  { value: "sem_chatbot", label: "Automação: site sem chat", lens: "automacao" },
  { value: "sem_agendamento", label: "Automação: sem agendamento online", lens: "automacao" },
  { value: "tem_loja", label: "Automação: tem loja online", lens: "automacao" },
  { value: "sem_instagram", label: "Marketing: sem Instagram", lens: "marketing" },
  { value: "ig_parado", label: "Marketing: Instagram parado", lens: "marketing" },
  { value: "sem_post_recorrente", label: "Marketing: sem post recorrente", lens: "marketing" },
  { value: "baixo_engajamento", label: "Marketing: baixo engajamento", lens: "marketing" },
  { value: "presenca_forte", label: "Marketing: presença forte (escalar)", lens: "marketing" },
  { value: "gmb_incompleto", label: "Marketing: Google incompleto", lens: "marketing" },
  { value: "situacao_irregular", label: "Advocacia: empresa irregular", lens: "advocacia" },
  { value: "tem_socios", label: "Advocacia: 2+ sócios", lens: "advocacia" },
  { value: "fora_simples", label: "Advocacia: fora do Simples", lens: "advocacia" },
  { value: "sem_politica", label: "Advocacia: sem política de privacidade", lens: "advocacia" },
  { value: "reputacao_atrito", label: "Advocacia: reputação em atrito", lens: "advocacia" },
];

// Profissao do dono -> lentes que ele enxerga. Espelha scoring._LENS na esteira.
const LENSES_BY_PROFESSION: Record<string, string[]> = {
  trafego: ["trafego"],
  automacao: ["automacao"],
  ambos: ["trafego", "automacao"],
  design: ["design"],
  web: ["design"],
  branding: ["design"],
  marketing: ["marketing"],
  advocacia: ["advocacia"],
};

/** Lista completa (todas as lentes). Use signalFilterOptions quando souber a
 *  profissao do dono. */
export const SIGNAL_FILTER_OPTIONS: { value: SignalFilter; label: string }[] =
  ALL_SIGNAL_FILTERS;

/** Filtros que fazem sentido pra quem esta olhando. Sem profissao conhecida,
 *  devolve tudo — mesmo comportamento de antes, sem regressao. */
export function signalFilterOptions(
  professions: string[] | null | undefined,
): { value: SignalFilter; label: string }[] {
  const profs = (professions ?? []).filter(Boolean);
  if (profs.length === 0) return ALL_SIGNAL_FILTERS;
  const lenses = new Set(profs.flatMap((p) => LENSES_BY_PROFESSION[p] ?? []));
  if (lenses.size === 0) return ALL_SIGNAL_FILTERS;
  return ALL_SIGNAL_FILTERS.filter((f) => f.lens === null || lenses.has(f.lens));
}

export function jaAnuncia(l: Lead): boolean {
  if (l.ads_active === true) return true;
  const s = l.site_signals;
  if (!s) return false;
  return (
    (s.ad_platforms?.length ?? 0) > 0 ||
    !!s.has_fb_pixel ||
    !!s.has_google_ads ||
    !!s.has_tiktok_pixel
  );
}

export function temSite(l: Lead): boolean {
  return !!(l.website && l.website.trim());
}

export function siteLento(l: Lead): boolean {
  const s = l.site_signals;
  if (!s) return false;
  if (s.perf_slow === true || s.slow === true) return true;
  if (typeof s.perf_score === "number" && s.perf_score < 50) return true;
  if (s.speed_category === "SLOW") return true;
  return false;
}

export function temInstagram(l: Lead): boolean {
  return !!(l.instagram && l.instagram.trim());
}

export function siteSemChat(l: Lead): boolean {
  const s = l.site_signals;
  return temSite(l) && !!s && s.has_chat_widget === false;
}

export function semAgendamento(l: Lead): boolean {
  const s = l.site_signals;
  return temSite(l) && !!s && s.has_online_booking === false;
}

export function temLoja(l: Lead): boolean {
  return l.site_signals?.has_ecommerce === true;
}

// O1 "negocio novo": meses desde a abertura (opened_on, ISO YYYY-MM-DD da
// BrasilAPI). null quando nao se sabe a data.
export function mesesDesdeAbertura(l: Lead): number | null {
  if (!l.opened_on) return null;
  const d = new Date(`${l.opened_on}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let m = (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
  if (now.getDate() < d.getDate()) m -= 1;
  return Math.max(m, 0);
}

// Negocio novo/recente: aberto ha no maximo 18 meses (faixa onde o score premia).
export function negocioNovo(l: Lead): boolean {
  const m = mesesDesdeAbertura(l);
  return m !== null && m <= 18;
}

// Chip pra fila/ficha. null quando nao se aplica (sem data ou ja estabelecido).
export function negocioNovoChip(l: Lead): SignalChip | null {
  const m = mesesDesdeAbertura(l);
  if (m === null || m > 18) return null;
  return { label: m < 6 ? "Negocio novo" : "Negocio recente", variant: "positive" };
}

// --- Sinais de MARKETING (presenca digital), derivados do social_signals ---
export function igParado(l: Lead): boolean {
  return temInstagram(l) && l.social_signals?.ig_status === "parado";
}

export function semPostRecorrente(l: Lead): boolean {
  const pf = l.social_signals?.post_freq;
  return temInstagram(l) && typeof pf === "number" && pf < 1;
}

export function baixoEngajamento(l: Lead): boolean {
  const er = l.social_signals?.engagement_rate;
  return typeof er === "number" && er < 1;
}

// Presenca forte (candidato a "escalar"): IG ativo + posta com recorrencia.
export function presencaForte(l: Lead): boolean {
  const s = l.social_signals;
  return temInstagram(l) && s?.ig_status === "ativo" && typeof s?.post_freq === "number" && s.post_freq >= 1;
}

// GMB (Perfil de Empresa no Google) incompleto: esta no Google mas falta
// site/horario/volume de avaliacoes.
export function gmbIncompleto(l: Lead): boolean {
  const onGoogle = !!l.maps_place_id || l.rating != null || !!l.reviews_count;
  if (!onGoogle) return true;
  return !(l.opening_hours && temSite(l) && (l.reviews_count ?? 0) >= 20);
}

// --- Sinais da area de advocacia -------------------------------------------
// Leem EMPRESA, nao presenca digital. "situacao irregular" e demanda de
// regularizacao aqui, nao lead morto como nas outras areas.

export function situacaoIrregular(l: Lead): boolean {
  const s = (l.company_status ?? "").toUpperCase();
  return !!s && s !== "ATIVA";
}

export function temSocios(l: Lead): boolean {
  return typeof l.socios_count === "number" && l.socios_count >= 2;
}

export function foraDoSimples(l: Lead): boolean {
  return l.site_signals?.simples === false;
}

/** So opina quando ha site: sem site, nao da pra saber se ha politica. */
export function semPoliticaPrivacidade(l: Lead): boolean {
  return temSite(l) && l.site_signals?.has_privacy_policy === false;
}

/** Nota baixa COM volume = atrito real com consumidor (sinal interno). */
export function reputacaoEmAtrito(l: Lead): boolean {
  return l.rating != null && l.rating < 4.0 && (l.reviews_count ?? 0) >= 30;
}

export function matchesSignal(l: Lead, f: SignalFilter): boolean {
  switch (f) {
    case "":
      return true;
    case "ja_anuncia":
      return jaAnuncia(l);
    case "nao_anuncia":
      return temSite(l) && !jaAnuncia(l);
    case "sem_site":
      return !temSite(l);
    case "site_lento":
      return siteLento(l);
    case "sem_chatbot":
      return siteSemChat(l);
    case "sem_agendamento":
      return semAgendamento(l);
    case "tem_loja":
      return temLoja(l);
    case "sem_instagram":
      return !temInstagram(l);
    case "ig_parado":
      return igParado(l);
    case "sem_post_recorrente":
      return semPostRecorrente(l);
    case "baixo_engajamento":
      return baixoEngajamento(l);
    case "presenca_forte":
      return presencaForte(l);
    case "gmb_incompleto":
      return gmbIncompleto(l);
    case "empresa_nova":
      return negocioNovo(l);
    case "situacao_irregular":
      return situacaoIrregular(l);
    case "tem_socios":
      return temSocios(l);
    case "fora_simples":
      return foraDoSimples(l);
    case "sem_politica":
      return semPoliticaPrivacidade(l);
    case "reputacao_atrito":
      return reputacaoEmAtrito(l);
    default:
      return false;
  }
}
