// Camada de dados — interface unica com 2 implementacoes:
//  - mock: em memoria (default, roda sem banco)
//  - supabase: banco real (quando NEXT_PUBLIC_DATA_SOURCE=supabase + envs)
// Trocar de uma pra outra nao toca a UI.
import type { ActivityEvent, ActorType, Lead, LeadDetail, LeadEditable, LeadFile, LeadStatus, ScanCoverage, SearchProfile, SearchProfileInput } from "../types";
import { mockRepo } from "./mock";
import { supabaseRepo } from "./supabase";

export interface LeadsRepo {
  list(): Promise<Lead[]>;
  detail(id: string): Promise<LeadDetail>;
  /** Cria lead manual (status inicial 'bruto'). */
  create(input: LeadEditable): Promise<Lead>;
  update(id: string, patch: LeadEditable): Promise<Lead>;
  /** Muda status validando a maquina de estados + guarda LGPD. Lanca erro se invalido. */
  transition(id: string, to: LeadStatus, actor: ActorType, note?: string): Promise<Lead>;
  setOptOut(id: string, value: boolean): Promise<Lead>;
  /** Arquiva/desarquiva: some da lista por padrao, reversivel. */
  setArchived(id: string, value: boolean): Promise<Lead>;
  /** Exclui de vez (hard delete; apaga proveniencia e historico em cascata). */
  remove(id: string): Promise<void>;
  /** Retorna o perfil de busca do dono logado, ou null se ainda nao existe. */
  getProfile(): Promise<SearchProfile | null>;
  /** Upsert do perfil de busca: cria se nao existe, atualiza se ja existe. */
  saveProfile(input: SearchProfileInput): Promise<SearchProfile>;
  /** Conta leads do dono, opcionalmente por status. Leve (sem trazer linhas);
   *  usado pelo acompanhamento ao vivo da busca. */
  countByStatus(status?: LeadStatus): Promise<number>;
  /** Lista zonas de cobertura, filtrando por nicho se informado, mais recentes primeiro. */
  listCoverage(niche?: string): Promise<ScanCoverage[]>;
  /** Ultimos N eventos de atividade, mais recentes primeiro. Padrao: 20. */
  listActivity(limit?: number): Promise<ActivityEvent[]>;
  /** Lista os arquivos anexados a um lead (bucket privado, escopo do dono). */
  listFiles(leadId: string): Promise<LeadFile[]>;
  /** Sobe um arquivo pro lead. Lanca erro se falhar. */
  uploadFile(leadId: string, file: File): Promise<void>;
  /** Remove um arquivo pelo caminho completo no bucket. */
  deleteFile(path: string): Promise<void>;
  /** URL assinada e curta pra abrir/baixar um arquivo do bucket privado. */
  fileSignedUrl(path: string): Promise<string>;
}

export type DataSource = "mock" | "supabase";

export function activeDataSource(): DataSource {
  const want = process.env.NEXT_PUBLIC_DATA_SOURCE;
  const hasEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL && !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return want === "supabase" && hasEnv ? "supabase" : "mock";
}

// supabaseRepo so toca a rede quando chamado; importa-lo aqui e inerte.
export function getRepo(): LeadsRepo {
  return activeDataSource() === "supabase" ? supabaseRepo : mockRepo;
}
