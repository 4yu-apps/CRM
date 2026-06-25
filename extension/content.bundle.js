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
  async function loginWithPassword(cfg, email, password) {
    const d = await tokenRequest(cfg, "password", { email, password });
    await saveSession(d);
    return d.access_token;
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
  async function logout() {
    await setConfig({ accessToken: "", refreshToken: "", expiresAt: 0 });
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

  // src/lib/normalize.mjs
  function onlyDigits(value) {
    return (value || "").replace(/\D/g, "");
  }
  function normalizePhone(value) {
    let d = onlyDigits(value);
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    return d.length === 10 || d.length === 11 ? d : null;
  }
  function phoneKey(value) {
    let d = onlyDigits(value);
    if (d.startsWith("55") && (d.length === 12 || d.length === 13)) d = d.slice(2);
    if (d.length === 11 && d[2] === "9") d = d.slice(0, 2) + d.slice(3);
    return d.length >= 10 ? d : null;
  }
  function fmtPhone(value) {
    const d = onlyDigits(value);
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return value || "-";
  }

  // src/lib/match.mjs
  function parsePhone(text) {
    if (!text) return null;
    const m = String(text).match(/\+?\d[\d\s().-]{8,}\d/);
    return m ? normalizePhone(m[0]) : null;
  }
  function norm(s) {
    return (s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  }
  function matchLead(parsed, leads) {
    const key = parsed.phone ? phoneKey(parsed.phone) : null;
    if (key) {
      const byPhone = leads.find((l) => phoneKey(l.phone) === key);
      if (byPhone) return { lead: byPhone, method: "phone" };
    }
    const name = norm(parsed.name);
    if (name) {
      const exact = leads.filter((l) => norm(l.business_name) === name);
      if (exact.length === 1) return { lead: exact[0], method: "name" };
      const partial = leads.filter((l) => {
        const bn = norm(l.business_name);
        return bn && (bn.includes(name) || name.includes(bn));
      });
      if (partial.length === 1) return { lead: partial[0], method: "name" };
      if (partial.length > 1) return { lead: null, method: "ambiguous", candidates: partial };
    }
    return { lead: null, method: "none" };
  }

  // src/lib/state-machine.mjs
  var TRANSITIONS = {
    bruto: ["enriquecido", "descartado"],
    enriquecido: ["qualificado", "descartado"],
    qualificado: ["rascunho_pronto", "descartado"],
    rascunho_pronto: ["aprovado", "descartado"],
    aprovado: ["enviado"],
    enviado: ["respondeu", "sem_resposta", "descartado"],
    sem_resposta: ["enviado", "descartado"],
    respondeu: ["interessado", "sem_interesse", "reuniao"],
    interessado: ["reuniao", "proposta", "perdido"],
    reuniao: ["proposta", "perdido"],
    proposta: ["fechado", "perdido"],
    // reativar volta pra Novo (visivel). O banco tambem aceita os pulos forward do
    // kanban (front) e reativar sem_interesse/perdido; aqui os botoes seguem o
    // fluxo passo a passo do WhatsApp, entao so o descartado tem reativar.
    descartado: ["rascunho_pronto"],
    sem_interesse: [],
    fechado: [],
    perdido: []
  };
  var STATUS_LABEL = {
    bruto: "Bruto",
    enriquecido: "Enriquecido",
    qualificado: "Qualificado",
    rascunho_pronto: "Rascunho pronto",
    aprovado: "Aprovado",
    enviado: "Enviado",
    sem_resposta: "Sem resposta",
    respondeu: "Respondeu",
    interessado: "Interessado",
    reuniao: "Reuniao",
    proposta: "Proposta",
    fechado: "Fechado",
    descartado: "Descartado",
    sem_interesse: "Sem interesse",
    perdido: "Perdido"
  };
  var TRANSITION_LABELS = {
    "bruto->enriquecido": "Enriquecer",
    "bruto->descartado": "Descartar",
    "enriquecido->qualificado": "Qualificar",
    "enriquecido->descartado": "Descartar",
    "qualificado->rascunho_pronto": "Gerar rascunho",
    "qualificado->descartado": "Descartar",
    "rascunho_pronto->descartado": "Descartar",
    "enviado->respondeu": "Respondeu",
    "enviado->sem_resposta": "Sem resposta",
    "enviado->descartado": "Numero errado",
    "respondeu->reuniao": "Agendou reuniao",
    "respondeu->interessado": "Interessado",
    "respondeu->sem_interesse": "Sem interesse",
    "interessado->reuniao": "Agendar reuniao",
    "interessado->proposta": "Virou proposta",
    "interessado->perdido": "Marcar perdido",
    "reuniao->proposta": "Virou proposta",
    "reuniao->perdido": "Marcar perdido",
    "proposta->fechado": "Fechar",
    "proposta->perdido": "Marcar perdido",
    "rascunho_pronto->aprovado": "Aprovar",
    "aprovado->enviado": "Marquei enviado",
    "sem_resposta->enviado": "Reenviei (follow-up)",
    "sem_resposta->descartado": "Descartar",
    "descartado->rascunho_pronto": "Reativar",
    "sem_interesse->rascunho_pronto": "Reativar",
    "perdido->rascunho_pronto": "Reativar"
  };
  var CONTACT_STATUSES = /* @__PURE__ */ new Set(["rascunho_pronto", "aprovado", "enviado"]);
  function transitionLabel(from, to) {
    return TRANSITION_LABELS[`${from}->${to}`] || STATUS_LABEL[to];
  }
  function contextualButtons(status, optOut = false) {
    return (TRANSITIONS[status] || []).map((to) => ({
      to,
      label: transitionLabel(status, to),
      blocked: optOut && CONTACT_STATUSES.has(to)
    }));
  }

  // src/lib/wa-quota.mjs
  var SWEEP_DAILY_CAP = 150;
  var SWEEP_MIN_INTERVAL_MS = 4e3;
  var PREFIX = "wa-check-";
  function dayKey(ms) {
    return PREFIX + new Date(ms).toISOString().slice(0, 10);
  }
  function makeQuota({ storage, now, cap } = {}) {
    const store = storage ?? chrome.storage.local;
    const clock = now ?? (() => Date.now());
    const limit = cap ?? SWEEP_DAILY_CAP;
    async function count() {
      const key = dayKey(clock());
      const got = await store.get(key);
      return Number(got?.[key] ?? 0);
    }
    return {
      async canCheck() {
        return await count() < limit;
      },
      async remaining() {
        return Math.max(0, limit - await count());
      },
      async record() {
        const key = dayKey(clock());
        const c = await count();
        await store.set({ [key]: c + 1 });
      }
    };
  }

  // src/content/main.mjs
  var PANEL_ID = "garimpo-panel";
  var LAUNCHER_ID = "garimpo-launcher";
  var CLOSED_KEY = "garimpo-panel-closed";
  var state = {
    cfg: null,
    repo: null,
    leads: [],
    loggedIn: false,
    lastKey: "",
    lastName: "",
    // nome da conversa aberta (chave do casamento lembrado)
    manual: {}
    // { nomeDaConversa: telefone }: casamento por numero, lembrado
  };
  var EDIT_FIELDS = [
    { key: "owner_name", label: "Dono / respons\xE1vel", type: "text" },
    { key: "phone", label: "Telefone", type: "text" },
    { key: "whatsapp", label: "WhatsApp", type: "text" },
    { key: "email", label: "E-mail", type: "text" },
    { key: "instagram", label: "Instagram", type: "text" },
    { key: "deal_value", label: "Or\xE7amento (R$)", type: "number" },
    { key: "meeting_link", label: "Link da reuni\xE3o (online)", type: "text" },
    { key: "meeting_location", label: "Local (presencial)", type: "text" }
  ];
  function waCheck(phone) {
    return new Promise((resolve) => {
      const reqId = `chk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const onMsg = (e) => {
        if (e.source !== window) return;
        const d = e.data;
        if (!d || d.source !== "garimpo-page" || d.type !== "check_result" || d.reqId !== reqId) return;
        window.removeEventListener("message", onMsg);
        resolve(d.verdict || "unknown");
      };
      window.addEventListener("message", onMsg);
      window.postMessage({ source: "garimpo-sw", type: "check_whatsapp", phone, reqId }, "*");
      setTimeout(() => {
        window.removeEventListener("message", onMsg);
        resolve("unknown");
      }, 8e3);
    });
  }
  var quota = makeQuota({});
  var sweeping = false;
  function updateSweepIndicator() {
    const elx = document.getElementById("gp-sweep");
    if (!elx) return;
    const total = sweepTargets(state.leads).length;
    elx.textContent = sweeping && total > 0 ? `validando n\xFAmeros... faltam ${total}` : "";
  }
  function jitter() {
    return SWEEP_MIN_INTERVAL_MS + Math.floor(Math.random() * 2e3);
  }
  var sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  function sweepTargets(leads) {
    return leads.filter((l) => (l.status === "rascunho_pronto" || l.status === "aprovado") && !l.archived && !l.whatsapp_checked_at).filter((l) => l.whatsapp || l.phone).sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
  }
  async function runSweep() {
    if (sweeping) return;
    sweeping = true;
    try {
      let unknownSeguidos = 0;
      for (const lead of sweepTargets(state.leads)) {
        if (document.hidden) break;
        if (!await quota.canCheck()) break;
        const verdict = await waCheck(lead.whatsapp || lead.phone);
        await quota.record();
        if (verdict === "none") {
          unknownSeguidos = 0;
          const updated = await state.repo.markNoWhatsapp(lead);
          state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...updated } : l);
        } else if (verdict === "has") {
          unknownSeguidos = 0;
          const updated = await state.repo.markChecked(lead.id);
          state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...updated } : l);
        } else {
          unknownSeguidos += 1;
          if (unknownSeguidos >= 3) break;
        }
        updateSweepIndicator();
        await sleep(jitter());
      }
    } finally {
      sweeping = false;
      updateSweepIndicator();
    }
  }
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) void runSweep();
  });
  window.addEventListener("message", async (e) => {
    if (e.source !== window) return;
    const d = e.data;
    if (!d || d.source !== "garimpo-page" || d.type !== "no_whatsapp") return;
    const key = phoneKey(d.phone);
    const lead = state.leads.find((l) => phoneKey(l.whatsapp || l.phone) === key);
    if (!lead || lead.archived || lead.whatsapp_checked_at) return;
    const updated = await state.repo.markNoWhatsapp(lead);
    state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...updated } : l);
    toast("N\xFAmero sem WhatsApp. Arquivei e marquei sem-whatsapp.");
    evaluate(true);
  });
  async function init() {
    state.cfg = await getConfig();
    const fresh = await ensureFreshToken(state.cfg);
    if (fresh && fresh !== state.cfg.accessToken) state.cfg = await getConfig();
    state.loggedIn = !!state.cfg.accessToken;
    state.manual = await loadManual();
    state.repo = createRepo(state.cfg);
    mountPanel();
    observe();
    if (state.loggedIn) {
      await refreshLeads();
      void runSweep();
    }
    updateBadge();
    evaluate(true);
    setInterval(keepAlive, 45 * 60 * 1e3);
  }
  async function keepAlive() {
    if (!state.cfg.accessToken) return;
    await ensureFreshToken(state.cfg);
    state.cfg = await getConfig();
    state.repo = createRepo(state.cfg);
  }
  async function refreshLeads() {
    try {
      state.leads = await state.repo.listLeads();
    } catch (e) {
      state.leads = [];
      if (/401|403|jwt|token|expired/i.test(e.message || "")) {
        await logout();
        state.cfg = await getConfig();
        state.loggedIn = false;
        state.repo = createRepo(state.cfg);
      }
      console.warn("[garimpo]", e.message);
    }
  }
  async function loadManual() {
    if (typeof chrome === "undefined" || !chrome.storage) return {};
    const { manualMatches } = await chrome.storage.local.get("manualMatches");
    return manualMatches || {};
  }
  function saveManual() {
    void setConfig({ manualMatches: state.manual });
  }
  function readPhoneFromChat() {
    const main = document.querySelector("#main");
    if (!main) return null;
    const node = main.querySelector('[data-id*="@c.us"]');
    if (!node) return null;
    const m = (node.getAttribute("data-id") || "").match(/(\d{10,15})@c\.us/);
    return m ? normalizePhone(m[1]) : null;
  }
  function readConversation() {
    const header = document.querySelector("#main header") || document.querySelector("header");
    if (!header) return { name: null, phone: null, rawName: "" };
    const titleEl = header.querySelector("span[title]") || header.querySelector('span[dir="auto"]');
    const rawName = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim() : "";
    const phoneFromName = parsePhone(rawName);
    let phone = phoneFromName || readPhoneFromChat() || parsePhone(header.textContent);
    const name = phoneFromName ? null : rawName;
    if (!phone && rawName && state.manual[rawName]) phone = state.manual[rawName];
    return { name, phone, rawName };
  }
  function evaluate(force = false) {
    if (!state.loggedIn) {
      if (state.lastKey === "__login__" && !force) return;
      state.lastKey = "__login__";
      renderLogin();
      return;
    }
    const parsed = readConversation();
    state.lastName = parsed.rawName || "";
    const key = `${parsed.phone || ""}|${parsed.name || ""}`;
    if (!force && key === state.lastKey) return;
    state.lastKey = key;
    renderBody(parsed, matchLead(parsed, state.leads));
  }
  async function doTransition(id, to, label) {
    try {
      const updated = await state.repo.transition(id, to);
      state.leads = state.leads.map((l) => l.id === id ? { ...l, ...updated, status: to } : l);
      toast(`Status: ${label}`);
      evaluate(true);
    } catch (e) {
      toast(`Erro: ${e.message}`, true);
    }
  }
  function el(tag, props = {}, children = []) {
    const node = document.createElement(tag);
    Object.assign(node, props);
    for (const c of [].concat(children)) node.append(c);
    return node;
  }
  function field(label, inputEl) {
    const wrap = el("label", { className: "gp-field" });
    wrap.append(el("span", { className: "gp-flabel", textContent: label }), inputEl);
    return wrap;
  }
  function mountPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = el("div", { id: PANEL_ID });
    panel.innerHTML = `
    <div class="gp-head">
      <span class="gp-mark"></span>
      <span class="gp-logo">4YU CRM</span>
      <span class="gp-src"></span>
      <span class="gp-sweep" id="gp-sweep"></span>
      <button class="gp-logout" title="Sair" aria-label="Sair" style="display:none">\u238B</button>
      <button class="gp-min" title="Minimizar painel" aria-label="Minimizar painel">\u2212</button>
      <button class="gp-close" title="Fechar painel" aria-label="Fechar painel">\xD7</button>
    </div>
    <div class="gp-body"></div>
    <div class="gp-foot">S\xF3 l\xEA seu WhatsApp. Status e edi\xE7\xF5es v\xE3o pro 4YU CRM.</div>`;
    document.body.append(panel);
    const markEl = panel.querySelector(".gp-mark");
    if (markEl && typeof chrome !== "undefined" && chrome.runtime) {
      const iconImg = document.createElement("img");
      iconImg.src = chrome.runtime.getURL("icons/icon-32.png");
      iconImg.alt = "4YU CRM";
      iconImg.width = 20;
      iconImg.height = 20;
      markEl.append(iconImg);
    }
    panel.querySelector(".gp-min").addEventListener("click", () => panel.classList.toggle("gp-collapsed"));
    const launcher = el("button", { id: LAUNCHER_ID, title: "Abrir 4YU CRM", textContent: "4Y" });
    launcher.setAttribute("aria-label", "Abrir 4YU CRM");
    document.body.append(launcher);
    const setClosed = (closed) => {
      panel.style.display = closed ? "none" : "";
      launcher.style.display = closed ? "flex" : "none";
      try {
        localStorage.setItem(CLOSED_KEY, closed ? "1" : "0");
      } catch {
      }
    };
    panel.querySelector(".gp-close").addEventListener("click", () => setClosed(true));
    launcher.addEventListener("click", () => setClosed(false));
    let closedPref = false;
    try {
      closedPref = localStorage.getItem(CLOSED_KEY) === "1";
    } catch {
    }
    setClosed(closedPref);
    panel.querySelector(".gp-logout").addEventListener("click", async () => {
      await logout();
      state.cfg = await getConfig();
      state.loggedIn = false;
      state.leads = [];
      state.repo = createRepo(state.cfg);
      updateBadge();
      state.lastKey = "";
      evaluate(true);
    });
  }
  function updateBadge() {
    const src = document.querySelector(`#${PANEL_ID} .gp-src`);
    if (src) src.textContent = state.loggedIn ? "" : "entrar";
    const out = document.querySelector(`#${PANEL_ID} .gp-logout`);
    if (out) out.style.display = state.loggedIn ? "" : "none";
  }
  function renderLogin() {
    const body = document.querySelector(`#${PANEL_ID} .gp-body`);
    if (!body) return;
    body.replaceChildren();
    body.append(el("p", { className: "gp-muted", textContent: "Entre com sua conta 4YU CRM pra ver e atualizar seus leads aqui na conversa." }));
    const email = el("input", { className: "gp-input", type: "email", placeholder: "voce@exemplo.com", autocomplete: "username" });
    const pass = el("input", { className: "gp-input", type: "password", placeholder: "sua senha", autocomplete: "current-password" });
    const btn = el("button", { className: "gp-save", textContent: "Entrar" });
    btn.addEventListener("click", async () => {
      if (!email.value.trim() || !pass.value) return toast("preencha e-mail e senha", true);
      btn.disabled = true;
      btn.textContent = "Entrando...";
      try {
        await loginWithPassword(state.cfg, email.value.trim(), pass.value);
        state.cfg = await getConfig();
        state.loggedIn = true;
        state.repo = createRepo(state.cfg);
        await refreshLeads();
        updateBadge();
        toast("Logado!");
        state.lastKey = "";
        evaluate(true);
      } catch (e) {
        toast("Login falhou: " + e.message, true);
        btn.disabled = false;
        btn.textContent = "Entrar";
      }
    });
    pass.addEventListener("keydown", (e) => {
      if (e.key === "Enter") btn.click();
    });
    body.append(el("div", { className: "gp-login" }, [field("E-mail", email), field("Senha", pass), btn]));
    updateBadge();
  }
  function renderBody(parsed, result) {
    const body = document.querySelector(`#${PANEL_ID} .gp-body`);
    if (!body) return;
    body.replaceChildren();
    if (result.lead) {
      body.append(leadCard(result.lead, result.method));
      return;
    }
    if (result.method === "ambiguous") {
      body.append(el("p", { className: "gp-muted", textContent: "V\xE1rios leads poss\xEDveis:" }));
      for (const c of result.candidates) {
        body.append(el("button", {
          className: "gp-cand",
          textContent: `${c.business_name} \xB7 ${STATUS_LABEL[c.status]}`,
          onclick: () => {
            if (state.lastName) {
              state.manual[state.lastName] = c.phone;
              saveManual();
            }
            renderBody(parsed, { lead: c, method: "name" });
          }
        }));
      }
      return;
    }
    const who = parsed.phone ? fmtPhone(parsed.phone) : parsed.name || "conversa";
    body.append(el("p", { className: "gp-muted", textContent: `N\xE3o achei lead pra: ${who}` }));
    body.append(el("p", { className: "gp-hint", textContent: "Cole o n\xFAmero do contato uma vez, eu lembro dele nas pr\xF3ximas." }));
    body.append(manualBox());
  }
  function leadCard(lead, method) {
    const card = el("div", { className: "gp-card" });
    card.append(el("div", { className: "gp-name", textContent: lead.business_name || "Sem nome" }));
    const meta = el("div", { className: "gp-meta" });
    meta.append(el("span", { className: `gp-badge gp-${lead.status}`, textContent: STATUS_LABEL[lead.status] || lead.status }));
    if (lead.phone) meta.append(el("span", { className: "gp-muted", textContent: fmtPhone(lead.phone) }));
    if (lead.score != null) meta.append(el("span", { className: "gp-muted", textContent: `score ${lead.score}` }));
    card.append(meta);
    card.append(el("div", { className: "gp-method", textContent: `casou por ${method === "phone" ? "n\xFAmero" : "nome"}` }));
    if (Array.isArray(lead.tags) && lead.tags.includes("sem-whatsapp")) {
      const box = el("div", { className: "gp-nowa" });
      box.append(el("div", { className: "gp-nowa-title", textContent: "Esse n\xFAmero n\xE3o tem WhatsApp" }));
      box.append(el("div", { className: "gp-muted", textContent: "Arquivei e marquei com a tag sem-whatsapp." }));
      const row = el("div", { className: "gp-actions" });
      row.append(el("button", {
        className: "gp-btn",
        textContent: "Desfazer",
        onclick: async () => {
          try {
            const updated = await state.repo.undoNoWhatsapp(lead);
            state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...updated } : l);
            toast("Pronto, voltei o lead.");
            evaluate(true);
          } catch (err) {
            toast(`Erro: ${err.message}`, true);
          }
        }
      }));
      row.append(el("button", {
        className: "gp-btn",
        textContent: "Corrigir n\xFAmero",
        onclick: () => openCorrigirNumero(lead)
      }));
      box.append(row);
      card.append(box);
    }
    const btns = contextualButtons(lead.status, lead.opt_out);
    if (btns.length === 0) {
      card.append(el("p", { className: "gp-muted", textContent: "Status final." }));
    } else {
      const row = el("div", { className: "gp-actions" });
      for (const b of btns) {
        row.append(el("button", {
          className: "gp-btn",
          textContent: b.label,
          disabled: b.blocked,
          title: b.blocked ? "Bloqueado: opt-out (LGPD)" : "",
          onclick: () => doTransition(lead.id, b.to, b.label)
        }));
      }
      card.append(row);
    }
    card.append(editForm(lead));
    return card;
  }
  async function openCorrigirNumero(lead) {
    const novo = window.prompt("N\xFAmero certo do WhatsApp (s\xF3 d\xEDgitos, com DDD):", lead.whatsapp || lead.phone || "");
    if (novo == null) return;
    try {
      const fields = { ...undoFields(lead), whatsapp: novo.replace(/\D/g, "") };
      const updated = await state.repo.updateLead(lead.id, fields);
      state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...updated } : l);
      toast("N\xFAmero corrigido. Vou revalidar.");
      evaluate(true);
      void runSweep();
    } catch (err) {
      toast(`Erro: ${err.message}`, true);
    }
  }
  function editForm(lead) {
    const form = el("div", { className: "gp-edit" });
    const inputs = {};
    for (const f of EDIT_FIELDS) {
      const inp = el("input", {
        className: "gp-input",
        type: f.type,
        value: lead[f.key] != null ? String(lead[f.key]) : ""
      });
      inputs[f.key] = inp;
      form.append(field(f.label, inp));
    }
    const mAt = el("input", { className: "gp-input", type: "datetime-local", value: toLocalInput(lead.meeting_at) });
    inputs.meeting_at = mAt;
    form.append(field("Reuni\xE3o (data/hora)", mAt));
    const notes = el("textarea", { className: "gp-input gp-textarea", rows: 3 });
    notes.value = lead.notes || "";
    inputs.notes = notes;
    form.append(field("Anota\xE7\xF5es", notes));
    const save = el("button", { className: "gp-save", textContent: "Salvar no lead" });
    save.addEventListener("click", async () => {
      const patch = {};
      for (const f of EDIT_FIELDS) {
        const raw = inputs[f.key].value.trim();
        const cur = lead[f.key] != null ? String(lead[f.key]) : "";
        if (raw === cur) continue;
        if (f.type === "number") patch[f.key] = raw === "" ? null : Number(raw);
        else patch[f.key] = raw === "" ? null : raw;
      }
      const mIso = inputs.meeting_at.value ? new Date(inputs.meeting_at.value).toISOString() : null;
      if (mIso !== (lead.meeting_at || null)) patch.meeting_at = mIso;
      const notesVal = inputs.notes.value;
      if (notesVal !== (lead.notes || "")) patch.notes = notesVal === "" ? null : notesVal;
      if (Object.keys(patch).length === 0) {
        toast("Nada mudou");
        return;
      }
      save.disabled = true;
      try {
        const updated = await state.repo.updateLead(lead.id, patch);
        state.leads = state.leads.map((l) => l.id === lead.id ? { ...l, ...patch, ...updated || {} } : l);
        toast("Salvo no lead");
        evaluate(true);
      } catch (e) {
        toast(`Erro: ${e.message}`, true);
        save.disabled = false;
      }
    });
    form.append(save);
    return form;
  }
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  function manualBox() {
    const box = el("div", { className: "gp-manual" });
    const input = el("input", { className: "gp-input", type: "text", placeholder: "Colar n\xFAmero do contato" });
    const go = el("button", { className: "gp-btn", textContent: "Buscar" });
    const apply = () => {
      const p = parsePhone(input.value);
      if (!p) return toast("n\xFAmero inv\xE1lido", true);
      if (state.lastName) {
        state.manual[state.lastName] = p;
        saveManual();
      }
      state.lastKey = "";
      evaluate(true);
    };
    go.addEventListener("click", apply);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") apply();
    });
    box.append(input, go);
    return box;
  }
  var toastTimer = null;
  function toast(msg, error = false) {
    let t = document.getElementById("gp-toast");
    if (!t) {
      t = el("div", { id: "gp-toast" });
      document.body.append(t);
    }
    t.textContent = msg;
    t.className = error ? "gp-err" : "";
    t.classList.add("gp-show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove("gp-show"), 2200);
  }
  function observe() {
    const root = document.querySelector("#app") || document.body;
    const obs = new MutationObserver(() => {
      clearTimeout(observe._t);
      observe._t = setTimeout(() => evaluate(), 400);
    });
    obs.observe(root, { childList: true, subtree: true });
  }
  init().catch((e) => console.error("[garimpo]", e));
})();
