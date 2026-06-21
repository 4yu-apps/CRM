(() => {
  // src/lib/config.mjs
  var DEFAULTS = {
    dataSource: "mock",
    // mock | supabase
    supabaseUrl: "",
    anonKey: "",
    accessToken: ""
    // JWT do usuario logado (RLS)
  };
  async function getConfig() {
    if (typeof chrome === "undefined" || !chrome.storage) return { ...DEFAULTS };
    const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
    return { ...DEFAULTS, ...stored };
  }
  function activeDataSource(cfg) {
    return cfg.dataSource === "supabase" && cfg.supabaseUrl && cfg.anonKey ? "supabase" : "mock";
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
  function mockRepo() {
    const leads2 = MOCK_LEADS.map((l) => ({ ...l }));
    return {
      source: "mock",
      async listLeads() {
        return leads2.map((l) => ({ ...l }));
      },
      async transition(id, to) {
        const lead = leads2.find((l) => l.id === id);
        if (!lead) throw new Error("lead nao encontrado");
        lead.status = to;
        return { ...lead };
      },
      async updateLead(id, fields) {
        const lead = leads2.find((l) => l.id === id);
        if (!lead) throw new Error("lead nao encontrado");
        Object.assign(lead, fields);
        return { ...lead };
      },
      // Mock: simula insercao, detecta duplicata por maps_place_id.
      async insertLead(lead) {
        const dup = lead.maps_place_id && leads2.find((l) => l.maps_place_id === lead.maps_place_id);
        if (dup) return null;
        const id = `mock-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
        leads2.push({ ...lead, id, status: "bruto" });
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
  function matchLead(parsed, leads2) {
    const phone = parsed.phone ? normalizePhone(parsed.phone) : null;
    if (phone) {
      const byPhone = leads2.find((l) => normalizePhone(l.phone) === phone);
      if (byPhone) return { lead: byPhone, method: "phone" };
    }
    const name = norm(parsed.name);
    if (name) {
      const exact = leads2.filter((l) => norm(l.business_name) === name);
      if (exact.length === 1) return { lead: exact[0], method: "name" };
      const partial = leads2.filter((l) => {
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

  // src/content/main.mjs
  var PANEL_ID = "garimpo-panel";
  var repo = null;
  var leads = [];
  var manualPhone = null;
  var lastKey = "";
  async function init() {
    const cfg = await getConfig();
    repo = createRepo(cfg);
    await refreshLeads();
    mountPanel(repo.source);
    observe();
    evaluate(true);
  }
  async function refreshLeads() {
    try {
      leads = await repo.listLeads();
    } catch (e) {
      leads = [];
      console.warn("[garimpo] nao consegui listar leads:", e.message);
    }
  }
  function readConversation() {
    if (manualPhone) return { name: null, phone: manualPhone };
    const header = document.querySelector("#main header") || document.querySelector("header");
    if (!header) return { name: null, phone: null };
    const titleEl = header.querySelector("span[title]") || header.querySelector('span[dir="auto"]');
    const rawName = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim() : "";
    const phoneFromName = parsePhone(rawName);
    const phone = phoneFromName || parsePhone(header.textContent);
    return { name: phoneFromName ? null : rawName, phone };
  }
  function evaluate(force = false) {
    const parsed = readConversation();
    const key = `${parsed.phone || ""}|${parsed.name || ""}`;
    if (!force && key === lastKey) return;
    lastKey = key;
    renderBody(parsed, matchLead(parsed, leads));
  }
  var EDIT_FIELDS = [
    { key: "owner_name", label: "Dono / responsavel", type: "text" },
    { key: "phone", label: "Telefone", type: "text" },
    { key: "whatsapp", label: "WhatsApp", type: "text" },
    { key: "email", label: "E-mail", type: "text" },
    { key: "instagram", label: "Instagram", type: "text" },
    { key: "deal_value", label: "Orcamento (R$)", type: "number" },
    { key: "meeting_link", label: "Link da reuniao", type: "text" },
    { key: "meeting_location", label: "Local (presencial)", type: "text" }
  ];
  function toLocalInput(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "";
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
  }
  async function doTransition(id, to, label) {
    try {
      const updated = await repo.transition(id, to);
      leads = leads.map((l) => l.id === id ? { ...l, ...updated, status: to } : l);
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
  function mountPanel(source) {
    if (document.getElementById(PANEL_ID)) return;
    const panel = el("div", { id: PANEL_ID });
    panel.innerHTML = `
    <div class="gp-head">
      <span class="gp-mark">4Y</span>
      <span class="gp-logo">Garimpo</span>
      <span class="gp-src">${source}</span>
      <button class="gp-min" title="Minimizar painel" aria-label="Minimizar painel">\u2212</button>
    </div>
    <div class="gp-body"></div>
    <div class="gp-foot">So le seu WhatsApp. Status e edicoes vao pro Garimpo.</div>`;
    document.body.append(panel);
    panel.querySelector(".gp-min").addEventListener("click", () => panel.classList.toggle("gp-collapsed"));
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
      body.append(el("p", { className: "gp-muted", textContent: "Varios leads possiveis:" }));
      for (const c of result.candidates) {
        body.append(el("button", {
          className: "gp-cand",
          textContent: `${c.business_name} \xB7 ${STATUS_LABEL[c.status]}`,
          onclick: () => renderBody(parsed, { lead: c, method: "name" })
        }));
      }
      return;
    }
    const who = parsed.phone ? fmtPhone(parsed.phone) : parsed.name || "conversa";
    body.append(el("p", { className: "gp-muted", textContent: `Nao achei lead casado para: ${who}` }));
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
    card.append(el("div", { className: "gp-method", textContent: `casou por ${method === "phone" ? "numero" : "nome"}` }));
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
    let form = null;
    const editToggle = el("button", { className: "gp-edit-toggle", textContent: "\u270E Editar / anotar" });
    editToggle.addEventListener("click", () => {
      if (form) {
        form.remove();
        form = null;
        editToggle.textContent = "\u270E Editar / anotar";
        return;
      }
      form = editForm(lead);
      card.append(form);
      editToggle.textContent = "Fechar edicao";
    });
    card.append(editToggle);
    return card;
  }
  function editForm(lead) {
    const form = el("div", { className: "gp-edit" });
    const inputs = {};
    for (const f of EDIT_FIELDS) {
      const wrap = el("label", { className: "gp-field" });
      wrap.append(el("span", { className: "gp-flabel", textContent: f.label }));
      const inp = el("input", {
        className: "gp-input",
        type: f.type,
        value: lead[f.key] != null ? String(lead[f.key]) : ""
      });
      inputs[f.key] = inp;
      wrap.append(inp);
      form.append(wrap);
    }
    const mWrap = el("label", { className: "gp-field" });
    mWrap.append(el("span", { className: "gp-flabel", textContent: "Reuniao (data/hora)" }));
    const mAt = el("input", { className: "gp-input", type: "datetime-local", value: toLocalInput(lead.meeting_at) });
    inputs.meeting_at = mAt;
    mWrap.append(mAt);
    form.append(mWrap);
    const notesWrap = el("label", { className: "gp-field" });
    notesWrap.append(el("span", { className: "gp-flabel", textContent: "Anotacoes" }));
    const notes = el("textarea", { className: "gp-input gp-textarea", rows: 3 });
    notes.value = lead.notes || "";
    inputs.notes = notes;
    notesWrap.append(notes);
    form.append(notesWrap);
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
        const updated = await repo.updateLead(lead.id, patch);
        leads = leads.map((l) => l.id === lead.id ? { ...l, ...patch, ...updated || {} } : l);
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
  function manualBox() {
    const box = el("div", { className: "gp-manual" });
    const input = el("input", { type: "text", placeholder: "Colar numero" });
    const go = el("button", { className: "gp-btn", textContent: "Buscar" });
    go.addEventListener("click", () => {
      const p = parsePhone(input.value);
      if (!p) return toast("numero invalido", true);
      manualPhone = p;
      evaluate(true);
      manualPhone = null;
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
