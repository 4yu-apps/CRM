// Camada de dados da extensao — mock | supabase. Mesma interface.
// READ-ONLY sobre o WhatsApp; a unica escrita e no NOSSO banco (status do lead).
import { MOCK_LEADS } from "./mock-data.mjs";
import { activeDataSource } from "./config.mjs";

function mockRepo() {
  const leads = MOCK_LEADS.map((l) => ({ ...l }));
  return {
    source: "mock",
    async listLeads() {
      return leads.map((l) => ({ ...l }));
    },
    async transition(id, to) {
      const lead = leads.find((l) => l.id === id);
      if (!lead) throw new Error("lead nao encontrado");
      lead.status = to;
      return { ...lead };
    },
    async updateLead(id, fields) {
      const lead = leads.find((l) => l.id === id);
      if (!lead) throw new Error("lead nao encontrado");
      Object.assign(lead, fields);
      return { ...lead };
    },
    // Mock: simula insercao, detecta duplicata por maps_place_id.
    async insertLead(lead) {
      const dup = lead.maps_place_id &&
        leads.find((l) => l.maps_place_id === lead.maps_place_id);
      if (dup) return null;
      const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      leads.push({ ...lead, id, status: "bruto" });
      return id;
    },
  };
}

function supabaseRepo(cfg) {
  const base = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1";
  const headers = {
    apikey: cfg.anonKey,
    Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}`,
    "Content-Type": "application/json",
  };
  return {
    source: "supabase",
    async listLeads() {
      const r = await fetch(`${base}/leads?select=*&order=updated_at.desc`, { headers });
      if (!r.ok) throw new Error(`leads: ${r.status}`);
      return r.json();
    },
    async transition(id, to) {
      // RPC do banco: valida transicao + guarda LGPD + grava historico.
      const r = await fetch(`${base}/rpc/transition_lead`, {
        method: "POST",
        headers,
        body: JSON.stringify({ p_lead_id: id, p_new_status: to, p_actor: "extension", p_note: null }),
      });
      if (!r.ok) throw new Error(`transition: ${r.status} ${await r.text()}`);
      const data = await r.json();
      return Array.isArray(data) ? data[0] : data;
    },
    // Edita campos do lead no NOSSO banco (dono, contato, anotacoes, orcamento).
    // Continua read-only sobre o WhatsApp: so escreve no Garimpo.
    async updateLead(id, fields) {
      const r = await fetch(`${base}/leads?id=eq.${id}`, {
        method: "PATCH",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify(fields),
      });
      if (!r.ok) throw new Error(`updateLead: ${r.status} ${await r.text()}`);
      const data = await r.json();
      return Array.isArray(data) ? data[0] : data;
    },
    // Insere um lead bruto vindo do Google Maps. owner_id cai no default
    // do banco (auth.uid() via RLS). Retorna o id do registro criado,
    // ou null se ja existia (HTTP 409 = violacao do indice unico place_id).
    async insertLead(lead) {
      const r = await fetch(`${base}/leads`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=representation" },
        body: JSON.stringify({ ...lead, status: "bruto" }),
      });
      if (r.status === 409) return null; // duplicata: ja existe, pula
      if (!r.ok) throw new Error(`insertLead: ${r.status} ${await r.text()}`);
      const data = await r.json();
      const row = Array.isArray(data) ? data[0] : data;
      return row?.id ?? null;
    },
  };
}

export function createRepo(cfg) {
  return activeDataSource(cfg) === "supabase" ? supabaseRepo(cfg) : mockRepo();
}
