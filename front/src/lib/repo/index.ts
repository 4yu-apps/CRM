// Camada de dados — interface unica com 2 implementacoes:
//  - mock: em memoria (default, roda sem banco)
//  - supabase: banco real (quando NEXT_PUBLIC_DATA_SOURCE=supabase + envs)
// Trocar de uma pra outra nao toca a UI.
import type { ActorType, Lead, LeadDetail, LeadEditable, LeadStatus } from "../types";
import { mockRepo } from "./mock";
import { supabaseRepo } from "./supabase";

export interface LeadsRepo {
  list(): Promise<Lead[]>;
  detail(id: string): Promise<LeadDetail>;
  update(id: string, patch: LeadEditable): Promise<Lead>;
  /** Muda status validando a maquina de estados + guarda LGPD. Lanca erro se invalido. */
  transition(id: string, to: LeadStatus, actor: ActorType, note?: string): Promise<Lead>;
  setOptOut(id: string, value: boolean): Promise<Lead>;
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
