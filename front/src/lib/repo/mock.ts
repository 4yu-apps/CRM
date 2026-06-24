// Implementacao mock — em memoria, espelha o comportamento do banco:
// valida transicoes, aplica guarda LGPD e grava historico (como os triggers).
import { canTransition, nextStatuses, STATUS_META } from "../state-machine";
import type { ActivityEvent, ActorType, FieldProvenance, Lead, LeadDetail, LeadEditable, LeadFile, LeadStatus, MessageTemplate, MessageTemplateInput, ScanCoverage, SearchPreset, SearchPresetInput, SearchProfile, SearchProfileInput, StatusHistory } from "../types";
import { buildSeed, DEMO_ACTIVITY, DEMO_COVERAGE, DEMO_OWNER, DEMO_PROFILE } from "./mock-data";
import type { LeadsRepo } from "./index";

const seed = buildSeed();
const store = {
  leads: seed.leads,
  provenance: seed.provenance,
  history: seed.history,
  // perfil em memoria: inicia com o demo e pode ser atualizado via saveProfile
  profile: { ...DEMO_PROFILE } as SearchProfile,
  coverage: DEMO_COVERAGE.map((c) => ({ ...c })),
  activity: DEMO_ACTIVITY.map((a) => ({ ...a })),
};

let _hid = 1_000;
const histId = () => `hist-live-${(++_hid).toString(36)}`;
let _nid = 0;
const leadId = () => `lead-new-${(++_nid).toString(36)}`;
const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x));
const find = (id: string) => store.leads.find((l) => l.id === id);

async function list(): Promise<Lead[]> {
  return clone(
    [...store.leads].sort((a, b) => +new Date(b.updated_at) - +new Date(a.updated_at)),
  );
}

async function detail(id: string): Promise<LeadDetail> {
  const lead = find(id);
  if (!lead) throw new Error("Lead nao encontrado");
  const provenance: FieldProvenance[] = store.provenance
    .filter((p) => p.lead_id === id)
    .sort((a, b) => +new Date(b.found_at) - +new Date(a.found_at));
  const history: StatusHistory[] = store.history
    .filter((h) => h.lead_id === id)
    .sort((a, b) => +new Date(b.changed_at) - +new Date(a.changed_at));
  return clone({ lead, provenance, history });
}

async function create(input: LeadEditable): Promise<Lead> {
  const now = new Date().toISOString();
  const id = leadId();
  const lead: Lead = {
    id,
    owner_id: DEMO_OWNER,
    status: "bruto",
    business_name: null,
    cnpj: null,
    phone: null,
    email: null,
    instagram: null,
    website: null,
    maps_place_id: null,
    maps_url: null,
    rating: null,
    reviews_count: null,
    category: null,
    address: null,
    neighborhood: null,
    city: null,
    state: null,
    owner_name: null,
    score: null,
    score_reason: null,
    service_target: "indefinido",
    ads_active: null,
    opt_out: false,
    opt_out_at: null,
    archived: false,
    created_at: now,
    updated_at: now,
    draft_msg1: null,
    draft_msg2: null,
    ...input,
  };
  store.leads.push(lead);
  store.history.push({
    id: histId(),
    lead_id: id,
    from_status: null,
    to_status: "bruto",
    actor: "human",
    changed_by: DEMO_OWNER,
    note: "criado manualmente",
    changed_at: now,
  });
  return clone(lead);
}

async function update(id: string, patch: LeadEditable): Promise<Lead> {
  const lead = find(id);
  if (!lead) throw new Error("Lead nao encontrado");
  Object.assign(lead, patch);
  lead.updated_at = new Date().toISOString();
  return clone(lead);
}

async function transition(
  id: string,
  to: LeadStatus,
  actor: ActorType,
  note?: string,
): Promise<Lead> {
  const lead = find(id);
  if (!lead) throw new Error("Lead nao encontrado");

  if (!nextStatuses(lead.status).includes(to)) {
    throw new Error(
      `Transicao invalida: ${STATUS_META[lead.status].label} -> ${STATUS_META[to].label}`,
    );
  }
  if (!canTransition(lead.status, to, lead.opt_out)) {
    throw new Error(`Lead com opt-out (LGPD) nao pode ir para ${STATUS_META[to].label}: contato bloqueado`);
  }

  const from = lead.status;
  lead.status = to;
  lead.updated_at = new Date().toISOString();
  store.history.push({
    id: histId(),
    lead_id: id,
    from_status: from,
    to_status: to,
    actor,
    changed_by: actor === "system" ? null : DEMO_OWNER,
    note: note ?? null,
    changed_at: lead.updated_at,
  });
  return clone(lead);
}

async function setOptOut(id: string, value: boolean): Promise<Lead> {
  const lead = find(id);
  if (!lead) throw new Error("Lead nao encontrado");
  lead.opt_out = value;
  lead.opt_out_at = value ? new Date().toISOString() : null;
  lead.updated_at = new Date().toISOString();
  return clone(lead);
}

async function setArchived(id: string, value: boolean): Promise<Lead> {
  const lead = find(id);
  if (!lead) throw new Error("Lead nao encontrado");
  lead.archived = value;
  lead.updated_at = new Date().toISOString();
  return clone(lead);
}

async function remove(id: string): Promise<void> {
  const i = store.leads.findIndex((l) => l.id === id);
  if (i === -1) throw new Error("Lead nao encontrado");
  store.leads.splice(i, 1);
  store.provenance = store.provenance.filter((p) => p.lead_id !== id);
  store.history = store.history.filter((h) => h.lead_id !== id);
}

async function getProfile(): Promise<SearchProfile | null> {
  return clone(store.profile);
}

async function saveProfile(input: SearchProfileInput): Promise<SearchProfile> {
  const now = new Date().toISOString();
  Object.assign(store.profile, input, { updated_at: now });
  return clone(store.profile);
}

async function countByStatus(status?: LeadStatus): Promise<number> {
  return status ? store.leads.filter((l) => l.status === status).length : store.leads.length;
}

async function listCoverage(niche?: string): Promise<ScanCoverage[]> {
  const items = niche
    ? store.coverage.filter((c) => c.niche === niche)
    : store.coverage;
  return clone(
    [...items].sort((a, b) => +new Date(b.covered_at) - +new Date(a.covered_at)),
  );
}

async function listActivity(limit = 20): Promise<ActivityEvent[]> {
  return clone(
    [...store.activity]
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at))
      .slice(0, limit),
  );
}

// Presets de busca em memoria (demo). Somem ao recarregar, esperado no mock.
const mockPresets: SearchPreset[] = [];

async function listPresets(): Promise<SearchPreset[]> {
  return clone(
    [...mockPresets].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
  );
}

async function savePreset(input: SearchPresetInput): Promise<SearchPreset> {
  const preset: SearchPreset = {
    id: `preset-${Date.now()}`,
    owner_id: DEMO_OWNER,
    name: input.name,
    params: input.params,
    created_at: new Date().toISOString(),
  };
  mockPresets.unshift(preset);
  return clone(preset);
}

async function deletePreset(id: string): Promise<void> {
  const i = mockPresets.findIndex((p) => p.id === id);
  if (i >= 0) mockPresets.splice(i, 1);
}

// Templates de mensagem em memoria (demo).
const mockTemplates: MessageTemplate[] = [];

async function listTemplates(): Promise<MessageTemplate[]> {
  return clone(
    [...mockTemplates].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at)),
  );
}

async function saveTemplate(input: MessageTemplateInput): Promise<MessageTemplate> {
  const now = new Date().toISOString();
  const t: MessageTemplate = {
    id: `tpl-${Date.now()}`,
    owner_id: DEMO_OWNER,
    name: input.name,
    body: input.body,
    kind: input.kind,
    created_at: now,
    updated_at: now,
  };
  mockTemplates.unshift(t);
  return clone(t);
}

async function updateTemplate(id: string, input: MessageTemplateInput): Promise<MessageTemplate> {
  const t = mockTemplates.find((x) => x.id === id);
  if (!t) throw new Error("Template nao encontrado");
  t.name = input.name;
  t.body = input.body;
  t.kind = input.kind;
  t.updated_at = new Date().toISOString();
  return clone(t);
}

async function deleteTemplate(id: string): Promise<void> {
  const i = mockTemplates.findIndex((x) => x.id === id);
  if (i >= 0) mockTemplates.splice(i, 1);
}

// Anexos em memoria (demo): guarda o arquivo como object URL pra abrir na aba.
// Some ao recarregar a pagina, e o esperado no modo mock.
const mockFiles = new Map<string, { file: LeadFile; url: string }[]>();

async function listFiles(leadId: string): Promise<LeadFile[]> {
  return (mockFiles.get(leadId) ?? []).map((x) => clone(x.file));
}

async function uploadFile(leadId: string, file: File): Promise<void> {
  const url =
    typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
      ? URL.createObjectURL(file)
      : "#";
  const path = `demo/${leadId}/${Date.now()}-${file.name}`;
  const entry = {
    file: { name: file.name, path, size: file.size, created_at: new Date().toISOString() },
    url,
  };
  mockFiles.set(leadId, [entry, ...(mockFiles.get(leadId) ?? [])]);
}

async function deleteFile(path: string): Promise<void> {
  for (const [k, arr] of mockFiles) {
    mockFiles.set(k, arr.filter((x) => x.file.path !== path));
  }
}

async function fileSignedUrl(path: string): Promise<string> {
  for (const arr of mockFiles.values()) {
    const hit = arr.find((x) => x.file.path === path);
    if (hit) return hit.url;
  }
  return "#";
}

export const mockRepo: LeadsRepo = {
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
