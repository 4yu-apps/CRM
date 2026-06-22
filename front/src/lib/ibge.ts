// Helpers para a API publica e gratuita de localidades do IBGE (sem chave).
// Tudo degrada com graca: se a rede ou a API falhar, retornamos lista vazia
// e a interface segue funcionando com o que ja estiver selecionado.

export interface UF {
  id: number;
  sigla: string;
  nome: string;
}

export interface Municipio {
  id: number;
  nome: string;
}

const BASE = "https://servicodados.ibge.gov.br/api/v1/localidades";

// Remove acentos pra busca tolerante ("sao" casa "São").
function normStr(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

// Busca os 27 estados (26 UFs mais o Distrito Federal), ja ordenados por nome.
export async function fetchEstados(): Promise<UF[]> {
  try {
    const res = await fetch(`${BASE}/estados?orderBy=nome`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is UF =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as UF).sigla === "string" &&
          typeof (item as UF).nome === "string",
      )
      .map((item) => ({ id: item.id, sigla: item.sigla, nome: item.nome }));
  } catch {
    return [];
  }
}

// Busca as cidades de uma UF (ex: "SP"), ja ordenadas por nome.
// Sem UF, nao ha o que buscar, entao devolvemos vazio direto.
export async function fetchMunicipios(uf: string): Promise<Municipio[]> {
  const sigla = uf.trim().toUpperCase();
  if (!sigla) return [];
  try {
    const res = await fetch(`${BASE}/estados/${sigla}/municipios?orderBy=nome`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    return data
      .filter(
        (item): item is Municipio =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as Municipio).nome === "string",
      )
      .map((item) => ({ id: item.id, nome: item.nome }));
  } catch {
    return [];
  }
}

// Resultado de busca nacional de municipio, incluindo a sigla da UF.
export interface MunicipioComUF {
  id: number;
  nome: string;
  uf: string; // sigla, ex: "SP"
  nomeUF: string; // nome por extenso, ex: "Sao Paulo"
}

// Busca municipios por nome (busca nacional, sem precisar escolher UF antes).
// Carrega a lista completa na primeira chamada e filtra em memoria.
// Limita a 20 resultados para nao sobrecarregar a UI.
// Exemplo: searchMunicipios("Maringa") -> [{ nome: "Maringa", uf: "PR", ... }, ...]
export async function searchMunicipios(nome: string): Promise<MunicipioComUF[]> {
  const query = nome.trim();
  if (!query || query.length < 2) return [];
  try {
    const todos = await _getAllMunicipios();
    const q = normStr(query);
    return todos
      .filter((m) => normStr(m.nome).startsWith(q))
      .slice(0, 20);
  } catch {
    return [];
  }
}

// Cache em memoria dos municipios (carregado uma vez por sessao do browser).
let _municipiosCache: MunicipioComUF[] | null = null;
let _municipiosFetch: Promise<MunicipioComUF[]> | null = null;

async function _getAllMunicipios(): Promise<MunicipioComUF[]> {
  if (_municipiosCache) return _municipiosCache;
  if (_municipiosFetch) return _municipiosFetch;
  _municipiosFetch = (async () => {
    const res = await fetch(`${BASE}/municipios?orderBy=nome&view=nivelado`);
    if (!res.ok) return [];
    const data: unknown = await res.json();
    if (!Array.isArray(data)) return [];
    const result: MunicipioComUF[] = [];
    for (const item of data) {
      if (typeof item !== "object" || item === null) continue;
      const m = item as Record<string, unknown>;
      // view=nivelado expoe campos como "municipio-nome", "UF-sigla", "UF-nome"
      const municipioNome = typeof m["municipio-nome"] === "string" ? m["municipio-nome"] : "";
      const ufSigla = typeof m["UF-sigla"] === "string" ? m["UF-sigla"] : "";
      const ufNome = typeof m["UF-nome"] === "string" ? m["UF-nome"] : "";
      const id = typeof m["municipio-id"] === "number" ? (m["municipio-id"] as number) : 0;
      if (!municipioNome || !ufSigla) continue;
      result.push({ id, nome: municipioNome, uf: ufSigla, nomeUF: ufNome });
    }
    _municipiosCache = result;
    return result;
  })();
  return _municipiosFetch;
}
