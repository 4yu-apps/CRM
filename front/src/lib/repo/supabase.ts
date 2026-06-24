// Implementacao supabase — banco real. Inerte ate existir env + sessao logada.
// A UI nao muda: mesma interface do mock.
import { getSupabase } from "../supabase/client";
import type { ActivityEvent, ActorType, Lead, LeadDetail, LeadEditable, LeadFile, LeadStatus, MessageTemplate, MessageTemplateInput, ScanCoverage, SearchPreset, SearchPresetInput, SearchProfile, SearchProfileInput } from "../types";

// Bucket PRIVADO dos anexos. Path: <uid>/<leadId>/<arquivo>. RLS no banco garante
// que cada dono so toca a propria pasta; download sai por URL assinada e curta.
const ANEXOS_BUCKET = "lead-anexos";

async function currentUid(): Promise<string> {
  const { data, error } = await getSupabase().auth.getUser();
  if (error || !data.user) throw new Error("Sessao expirada. Entre de novo.");
  return data.user.id;
}
import type { LeadsRepo } from "./index";

async function list(): Promise<Lead[]> {
  // Escopa ao dono logado. A RLS protege contra acesso indevido, mas admin
  // enxerga todos os donos pela RLS; sem este filtro a fila/funil mostrariam
  // leads de OUTROS donos misturados. A visao cross-dono e so na tela Admin
  // (API propria com service role).
  //
  // Pagina em lotes ate esgotar: o PostgREST corta em ~1000 linhas por padrao,
  // entao um unico select truncava a base SILENCIOSAMENTE acima disso (leads
  // somem sem aviso). Aqui acumulamos pagina a pagina ate vir um lote curto.
  // Ordena por updated_at + id (desempate estavel) pra paginacao nao repetir
  // nem pular linhas com a mesma data.
  const sb = getSupabase();
  const uid = await currentUid();
  const PAGE = 1000;
  const all: Lead[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await sb
      .from("leads")
      .select("*")
      .eq("owner_id", uid)
      .order("updated_at", { ascending: false })
      .order("id", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    const batch = (data ?? []) as Lead[];
    all.push(...batch);
    if (batch.length < PAGE) break;
  }
  return all;
}

async function detail(id: string): Promise<LeadDetail> {
  const sb = getSupabase();
  const [lead, prov, hist] = await Promise.all([
    sb.from("leads").select("*").eq("id", id).single(),
    sb.from("lead_field_provenance").select("*").eq("lead_id", id).order("found_at", { ascending: false }),
    sb.from("lead_status_history").select("*").eq("lead_id", id).order("changed_at", { ascending: false }),
  ]);
  if (lead.error) throw new Error(lead.error.message);
  return {
    lead: lead.data as Lead,
    provenance: (prov.data ?? []) as LeadDetail["provenance"],
    history: (hist.data ?? []) as LeadDetail["history"],
  };
}

async function create(input: LeadEditable): Promise<Lead> {
  // owner_id e status caem nos defaults do banco (auth.uid() / 'bruto').
  const { data, error } = await getSupabase().from("leads").insert(input).select().single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

async function update(id: string, patch: LeadEditable): Promise<Lead> {
  const { data, error } = await getSupabase()
    .from("leads")
    .update(patch)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

async function transition(
  id: string,
  to: LeadStatus,
  actor: ActorType,
  note?: string,
): Promise<Lead> {
  // RPC do banco: valida transicao + guarda LGPD + grava historico (Fase 0).
  const { data, error } = await getSupabase().rpc("transition_lead", {
    p_lead_id: id,
    p_new_status: to,
    p_actor: actor,
    p_note: note ?? null,
  });
  if (error) throw new Error(error.message);
  return (Array.isArray(data) ? data[0] : data) as Lead;
}

async function setOptOut(id: string, value: boolean): Promise<Lead> {
  const { data, error } = await getSupabase()
    .from("leads")
    .update({ opt_out: value })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

async function setArchived(id: string, value: boolean): Promise<Lead> {
  const { data, error } = await getSupabase()
    .from("leads")
    .update({ archived: value })
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as Lead;
}

async function remove(id: string): Promise<void> {
  const { error } = await getSupabase().from("leads").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function getProfile(): Promise<SearchProfile | null> {
  // PGRST116 = "no rows" — retorna null sem lancar erro
  const { data, error } = await getSupabase()
    .from("search_profile")
    .select("*")
    .maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? null) as SearchProfile | null;
}

async function saveProfile(input: SearchProfileInput): Promise<SearchProfile> {
  // owner_id cai no default do banco (auth.uid()); RLS garante isolamento.
  const { data, error } = await getSupabase()
    .from("search_profile")
    .upsert(input, { onConflict: "owner_id" })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SearchProfile;
}

async function countByStatus(status?: LeadStatus): Promise<number> {
  // head:true + count:exact traz so a contagem (sem linhas). Escopa ao dono
  // logado (admin veria todos pela RLS sem este filtro).
  let q = getSupabase()
    .from("leads")
    .select("id", { count: "exact", head: true })
    .eq("owner_id", await currentUid());
  if (status) q = q.eq("status", status);
  const { count, error } = await q;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function listCoverage(niche?: string): Promise<ScanCoverage[]> {
  let q = getSupabase()
    .from("scan_coverage")
    .select("*")
    .order("covered_at", { ascending: false });
  if (niche) q = q.eq("niche", niche);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as ScanCoverage[];
}

async function listActivity(limit = 20): Promise<ActivityEvent[]> {
  const { data, error } = await getSupabase()
    .from("activity_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return (data ?? []) as ActivityEvent[];
}

async function listFiles(leadId: string): Promise<LeadFile[]> {
  const uid = await currentUid();
  const prefix = `${uid}/${leadId}`;
  const { data, error } = await getSupabase()
    .storage.from(ANEXOS_BUCKET)
    .list(prefix, { sortBy: { column: "created_at", order: "desc" } });
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter((o) => o.id !== null) // ignora entradas de "pasta"
    .map((o) => ({
      name: o.name,
      path: `${prefix}/${o.name}`,
      size: (o.metadata?.size as number | undefined) ?? 0,
      created_at: o.created_at ?? null,
    }));
}

async function uploadFile(leadId: string, file: File): Promise<void> {
  const uid = await currentUid();
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120);
  const path = `${uid}/${leadId}/${Date.now()}-${safe}`;
  const { error } = await getSupabase()
    .storage.from(ANEXOS_BUCKET)
    .upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
}

async function deleteFile(path: string): Promise<void> {
  const { error } = await getSupabase().storage.from(ANEXOS_BUCKET).remove([path]);
  if (error) throw new Error(error.message);
}

async function fileSignedUrl(path: string): Promise<string> {
  const { data, error } = await getSupabase()
    .storage.from(ANEXOS_BUCKET)
    .createSignedUrl(path, 60);
  if (error || !data) throw new Error(error?.message ?? "Erro ao gerar o link do arquivo");
  return data.signedUrl;
}

async function listPresets(): Promise<SearchPreset[]> {
  const { data, error } = await getSupabase()
    .from("search_presets")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as SearchPreset[];
}

async function savePreset(input: SearchPresetInput): Promise<SearchPreset> {
  // owner_id cai no default do banco (auth.uid()).
  const { data, error } = await getSupabase()
    .from("search_presets")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as SearchPreset;
}

async function deletePreset(id: string): Promise<void> {
  const { error } = await getSupabase().from("search_presets").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

async function listTemplates(): Promise<MessageTemplate[]> {
  const { data, error } = await getSupabase()
    .from("message_templates")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as MessageTemplate[];
}

async function saveTemplate(input: MessageTemplateInput): Promise<MessageTemplate> {
  const { data, error } = await getSupabase()
    .from("message_templates")
    .insert(input)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MessageTemplate;
}

async function updateTemplate(id: string, input: MessageTemplateInput): Promise<MessageTemplate> {
  const { data, error } = await getSupabase()
    .from("message_templates")
    .update(input)
    .eq("id", id)
    .select()
    .single();
  if (error) throw new Error(error.message);
  return data as MessageTemplate;
}

async function deleteTemplate(id: string): Promise<void> {
  const { error } = await getSupabase().from("message_templates").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export const supabaseRepo: LeadsRepo = {
  list,
  detail,
  create,
  update,
  transition,
  setOptOut,
  setArchived,
  remove,
  getProfile,
  saveProfile,
  countByStatus,
  listCoverage,
  listPresets,
  savePreset,
  deletePreset,
  listTemplates,
  saveTemplate,
  updateTemplate,
  deleteTemplate,
  listActivity,
  listFiles,
  uploadFile,
  deleteFile,
  fileSignedUrl,
};
