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
