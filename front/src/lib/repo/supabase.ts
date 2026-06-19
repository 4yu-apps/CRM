// Implementacao supabase — banco real. Inerte ate existir env + sessao logada.
// A UI nao muda: mesma interface do mock.
import { getSupabase } from "../supabase/client";
import type { ActivityEvent, ActorType, Lead, LeadDetail, LeadEditable, LeadStatus, ScanCoverage, SearchProfile, SearchProfileInput } from "../types";
import type { LeadsRepo } from "./index";

async function list(): Promise<Lead[]> {
  const { data, error } = await getSupabase()
    .from("leads")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Lead[];
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
  listCoverage,
  listActivity,
};
