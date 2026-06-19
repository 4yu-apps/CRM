// Implementacao supabase — banco real. Inerte ate existir env + sessao logada.
// A UI nao muda: mesma interface do mock.
import { getSupabase } from "../supabase/client";
import type { ActorType, Lead, LeadDetail, LeadEditable, LeadStatus } from "../types";
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

export const supabaseRepo: LeadsRepo = { list, detail, update, transition, setOptOut };
