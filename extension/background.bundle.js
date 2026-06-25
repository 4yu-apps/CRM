(() => {
  // src/lib/config.mjs
  var DEFAULTS = {
    dataSource: "supabase",
    // mock | supabase (ja vem supabase)
    supabaseUrl: "https://uqwnpuonrbupsqstetww.supabase.co",
    anonKey: "sb_publishable_qSYj4Gyj4r7BZVQqpJnfAQ_4LwxEdtw",
    accessToken: "",
    // JWT do usuario logado (RLS) — vem do login no card
    refreshToken: "",
    // renova o token sozinho (sessao longa, sem cair a cada 1h)
    expiresAt: 0
    // epoch ms de expiracao do accessToken
  };
  async function getConfig() {
    if (typeof chrome === "undefined" || !chrome.storage) return { ...DEFAULTS };
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
  }
  async function setConfig(patch) {
    if (typeof chrome === "undefined" || !chrome.storage) return;
    await chrome.storage.local.set(patch);
  }
  function activeDataSource(cfg) {
    return cfg.dataSource === "supabase" && cfg.supabaseUrl && cfg.anonKey && cfg.accessToken ? "supabase" : "mock";
  }

  // src/lib/auth.mjs
  async function tokenRequest(cfg, grantType, payload) {
    const url = cfg.supabaseUrl.replace(/\/$/, "");
    const r = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.error_description || data.msg || data.error || `HTTP ${r.status}`);
    return data;
  }
  async function saveSession(d) {
    await setConfig({
      accessToken: d.access_token,
      refreshToken: d.refresh_token,
      expiresAt: Date.now() + (d.expires_in ?? 3600) * 1e3,
      dataSource: "supabase"
    });
  }
  async function ensureFreshToken(cfg) {
    if (!cfg.accessToken) return null;
    const near = cfg.expiresAt && Date.now() > cfg.expiresAt - 12e4;
    if (!near || !cfg.refreshToken) return cfg.accessToken;
    try {
      const d = await tokenRequest(cfg, "refresh_token", { refresh_token: cfg.refreshToken });
      await saveSession(d);
      return d.access_token;
    } catch {
      return cfg.accessToken;
    }
  }

  // src/lib/mock-data.mjs
  var MOCK_LEADS = [
    { id: "lead-1", business_name: "Studio Bella Estetica", phone: "44999990002", status: "rascunho_pronto", opt_out: false, city: "Maringa", score: 88 },
    { id: "lead-2", business_name: "Hamburgueria do Ze", phone: "44999990003", status: "aprovado", opt_out: false, city: "Maringa", score: 88 },
    { id: "lead-3", business_name: "Otica Visao Clara", phone: "44999990006", status: "enviado", opt_out: false, city: "Maringa", score: 68 },
    { id: "lead-4", business_name: "Academia CorpoFit", phone: "44999990008", status: "respondeu", opt_out: false, city: "Maringa", score: 79 },
    { id: "lead-5", business_name: "Clinica OdontoSorriso", phone: "44999990009", status: "interessado", opt_out: false, city: "Maringa", score: 85 },
    { id: "lead-6", business_name: "Doceria Acucar & Arte", phone: "44999990015", status: "enriquecido", opt_out: true, city: "Maringa", score: null }
  ];

  // src/lib/repo.mjs
  function noWhatsappFields(lead, nowIso) {
    const tags = Array.isArray(lead?.tags) ? lead.tags : [];
    const next = tags.includes("sem-whatsapp") ? tags : [...tags, "sem-whatsapp"];
    return { archived: true, tags: next, whatsapp_checked_at: nowIso };
  }
  function undoFields(lead) {
    const tags = (Array.isArray(lead?.tags) ? lead.tags : []).filter((t) => t !== "sem-whatsapp");
    return { archived: false, tags, whatsapp_checked_at: null };
  }
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
        const dup = lead.maps_place_id && leads.find((l) => l.maps_place_id === lead.maps_place_id);
        if (dup) return null;
        const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        leads.push({ ...lead, id, status: "bruto" });
        return id;
      }
    };
  }
  function supabaseRepo(cfg) {
    const base = cfg.supabaseUrl.replace(/\/$/, "") + "/rest/v1";
    const headers = {
      apikey: cfg.anonKey,
      Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}`,
      "Content-Type": "application/json"
    };
    return {
      source: "supabase",
      async listLeads() {
        const r = await fetch(`${base}/leads?select=*&order=updated_at.desc`, { headers });
        if (!r.ok) throw new Error(`leads: ${r.status}`);
        return r.json();
      },
      async transition(id, to) {
        const r = await fetch(`${base}/rpc/transition_lead`, {
          method: "POST",
          headers,
          body: JSON.stringify({ p_lead_id: id, p_new_status: to, p_actor: "extension", p_note: null })
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
          body: JSON.stringify(fields)
        });
        if (!r.ok) throw new Error(`updateLead: ${r.status} ${await r.text()}`);
        const data = await r.json();
        return Array.isArray(data) ? data[0] : data;
      },
      async markNoWhatsapp(lead) {
        return this.updateLead(lead.id, noWhatsappFields(lead, (/* @__PURE__ */ new Date()).toISOString()));
      },
      async markChecked(id) {
        return this.updateLead(id, { whatsapp_checked_at: (/* @__PURE__ */ new Date()).toISOString() });
      },
      async undoNoWhatsapp(lead) {
        return this.updateLead(lead.id, undoFields(lead));
      },
      // Insere um lead bruto vindo do Google Maps. owner_id cai no default
      // do banco (auth.uid() via RLS). Retorna o id do registro criado,
      // ou null se ja existia (HTTP 409 = violacao do indice unico place_id).
      async insertLead(lead) {
        const r = await fetch(`${base}/leads`, {
          method: "POST",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify({ ...lead, status: "bruto" })
        });
        if (r.status === 409) return null;
        if (!r.ok) throw new Error(`insertLead: ${r.status} ${await r.text()}`);
        const data = await r.json();
        const row = Array.isArray(data) ? data[0] : data;
        return row?.id ?? null;
      }
    };
  }
  function createRepo(cfg) {
    return activeDataSource(cfg) === "supabase" ? supabaseRepo(cfg) : mockRepo();
  }

  // src/background.mjs
  var FINAL_STATUSES = /* @__PURE__ */ new Set(["fechado", "perdido", "sem_interesse", "descartado"]);
  var NOTIF_KEY = "gp-followup-notif-date";
  var NOTIF_ID = "gp-followups";
  chrome.alarms.create("gp-followups", { periodInMinutes: 60 });
  chrome.runtime.onInstalled.addListener(() => {
    chrome.alarms.create("gp-followups", { periodInMinutes: 60 });
  });
  async function checkFollowups() {
    const cfg = await getConfig();
    const token = await ensureFreshToken(cfg);
    if (!token) return;
    const cfgWithToken = { ...cfg, accessToken: token };
    const repo = createRepo(cfgWithToken);
    let leads;
    try {
      leads = await repo.listLeads();
    } catch {
      return;
    }
    const todayEnd = /* @__PURE__ */ new Date();
    todayEnd.setHours(23, 59, 59, 999);
    const todayEndMs = todayEnd.getTime();
    const due = leads.filter((l) => {
      if (!l.followup_at) return false;
      if (FINAL_STATUSES.has(l.status)) return false;
      const d = new Date(l.followup_at).getTime();
      return d <= todayEndMs;
    });
    if (due.length === 0) return;
    const today = (/* @__PURE__ */ new Date()).toISOString().slice(0, 10);
    const stored = await chrome.storage.local.get(NOTIF_KEY);
    if (stored[NOTIF_KEY] === today) return;
    await chrome.storage.local.set({ [NOTIF_KEY]: today });
    const n = due.length;
    const msg = n === 1 ? "Voc\xEA tem 1 follow-up pra hoje." : `Voc\xEA tem ${n} follow-ups pra hoje.`;
    chrome.notifications.create(NOTIF_ID, {
      type: "basic",
      iconUrl: "icons/icon-128.png",
      title: "4YU CRM",
      message: msg,
      priority: 1
    });
  }
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === "gp-followups") {
      checkFollowups();
    }
  });
  chrome.notifications.onClicked.addListener((notifId) => {
    if (notifId === NOTIF_ID) {
      chrome.tabs.create({ url: "https://crm.4yumkt.com.br/" });
    }
  });
  function waUrl(phone, text) {
    const digits = String(phone || "").replace(/\D/g, "");
    if (!digits) return null;
    const num = digits.startsWith("55") ? digits : digits.length >= 12 ? digits : `55${digits}`;
    const base = `https://web.whatsapp.com/send?phone=${num}`;
    return text && String(text).trim() ? `${base}&text=${encodeURIComponent(text)}` : base;
  }
  function openWhatsApp(phone, text) {
    const url = waUrl(phone, text);
    if (!url) return;
    chrome.tabs.query({ url: "https://web.whatsapp.com/*" }, (tabs) => {
      if (!tabs || tabs.length === 0) {
        chrome.tabs.create({ url });
        return;
      }
      const tab = tabs[0];
      chrome.tabs.update(tab.id, { active: true });
      if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
      chrome.tabs.sendMessage(tab.id, { type: "garimpo_switch_chat", phone, text }, (resp) => {
        if (chrome.runtime.lastError || !resp || !resp.ok) {
          chrome.tabs.update(tab.id, { url });
        }
      });
    });
  }
  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === "garimpo_open_whatsapp") {
      openWhatsApp(msg.phone, msg.text);
      if (sendResponse) sendResponse({ ok: true });
    }
    return false;
  });
})();
