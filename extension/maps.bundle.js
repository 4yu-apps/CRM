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

  // src/lib/maps-parse.mjs
  function extractPlaceId(href) {
    if (!href) return "";
    const m1 = href.match(/[!,]1s([A-Za-z0-9_:-]{10,})/);
    if (m1) return m1[1];
    try {
      const u = new URL(href, "https://www.google.com");
      const p = u.searchParams.get("placeid") || u.searchParams.get("place_id");
      if (p) return p;
    } catch (_) {
    }
    return "";
  }
  function parseRatingText(text) {
    if (!text) return { rating: null, reviews_count: null };
    const ratingMatch = text.match(/\b(\d)[,.](\d)\b/);
    if (!ratingMatch) return { rating: null, reviews_count: null };
    const rating = parseFloat(`${ratingMatch[1]}.${ratingMatch[2]}`);
    const afterRating = text.slice(text.indexOf(ratingMatch[0]) + ratingMatch[0].length);
    const allNums = [...afterRating.matchAll(/\b(\d[\d.,]*\d|\d)\b/g)].map((m) => parseInt(m[1].replace(/[.,]/g, ""), 10)).filter((n) => !isNaN(n));
    let reviews_count = null;
    if (allNums.length > 0) {
      const big = allNums.find((n) => n > 5);
      reviews_count = big !== void 0 ? big : allNums[allNums.length - 1];
    }
    return {
      rating: isNaN(rating) ? null : Math.min(5, Math.max(0, rating)),
      reviews_count
    };
  }
  function parseState(address) {
    if (!address) return "";
    const m = address.match(/[-,]\s*([A-Z]{2})\s*(?:\d{5}|$)/);
    return m ? m[1] : "";
  }
  function parseCity(address) {
    if (!address) return "";
    const m = address.match(/,\s*([^,]+?)\s*-\s*[A-Z]{2}/);
    return m ? m[1].trim() : "";
  }
  function parseCard(card) {
    if (!card) return null;
    let business_name = "";
    const nameLink = card.querySelector("a[aria-label]");
    if (nameLink) {
      business_name = (nameLink.getAttribute("aria-label") || "").trim();
    }
    if (!business_name) {
      const h = card.querySelector('[role="heading"], [role="img"][aria-label]');
      business_name = h ? (h.getAttribute("aria-label") || h.textContent || "").trim() : "";
    }
    if (!business_name) {
      for (const el of card.querySelectorAll("span, div")) {
        const t = (el.textContent || "").trim();
        if (t.length > 2 && t.length < 120 && !t.includes("\n")) {
          business_name = t;
          break;
        }
      }
    }
    let maps_url = "";
    let maps_place_id = "";
    const linkEl = card.querySelector('a[href*="/maps/"]') || card.querySelector('a[href*="google.com/maps"]');
    if (linkEl) {
      const href = linkEl.getAttribute("href") || "";
      maps_url = href.startsWith("http") ? href : `https://www.google.com${href}`;
      maps_place_id = extractPlaceId(href);
    }
    let rating = null;
    let reviews_count = null;
    const ratingEl = card.querySelector('[aria-label*="estrela"], [aria-label*="star"], [aria-label*="avalia"]');
    if (ratingEl) {
      const label = ratingEl.getAttribute("aria-label") || ratingEl.textContent || "";
      const parsed = parseRatingText(label);
      rating = parsed.rating;
      reviews_count = parsed.reviews_count;
    }
    if (rating === null) {
      for (const el of card.querySelectorAll("span")) {
        const t = (el.textContent || "").trim();
        if (/^[\d][,.][\d]$/.test(t)) {
          rating = parseFloat(t.replace(",", "."));
          break;
        }
      }
    }
    let category = "";
    const catEl = card.querySelector('[jsaction*="category"], [data-value*="category"]');
    if (catEl) category = (catEl.textContent || "").trim();
    if (!category) {
      const spans = Array.from(card.querySelectorAll("span"));
      for (const sp of spans) {
        const t = (sp.textContent || "").trim();
        if (t.length > 1 && t.length < 60 && !/\d/.test(t) && !t.includes("\n") && t !== business_name) {
          category = t;
          break;
        }
      }
    }
    let address = "";
    const addrEl = card.querySelector('[aria-label*="ndereco"], [aria-label*="Address"], [data-tooltip*="ndereco"]');
    if (addrEl) address = (addrEl.getAttribute("aria-label") || addrEl.textContent || "").replace(/^[Ee]ndere[cç]o:\s*/i, "").trim();
    if (!address) {
      for (const el of card.querySelectorAll("span, div")) {
        const t = (el.textContent || "").trim();
        if (t.length > 10 && t.length < 200 && /\d/.test(t) && t.includes(",")) {
          address = t;
          break;
        }
      }
    }
    const state = parseState(address);
    const city = parseCity(address);
    let phone = "";
    const telLink = card.querySelector('a[href*="tel:"]');
    if (telLink) phone = (telLink.getAttribute("href") || "").replace(/^tel:/, "").trim();
    if (!phone) {
      const callEl = card.querySelector('[aria-label*="Ligar"], [aria-label*="telefone"], [data-item-id*="phone"]');
      const src = callEl ? callEl.getAttribute("aria-label") || callEl.textContent || "" : card.textContent || "";
      const m = src.match(/\(?\d{2}\)?\s?9?\d{4}[-\s.]?\d{4}/);
      if (m) phone = m[0].trim();
    }
    let website = "";
    for (const a of card.querySelectorAll("a[href]")) {
      const h = a.getAttribute("href") || "";
      if (h.startsWith("http") && !h.includes("google.com") && !h.includes("/maps/")) {
        website = h;
        break;
      }
    }
    return {
      business_name,
      maps_place_id,
      maps_url,
      rating,
      reviews_count,
      category,
      address,
      neighborhood: "",
      // nao disponivel diretamente no card da lista
      city,
      state,
      phone,
      website
    };
  }
  function parseResultsList(root) {
    if (!root) return [];
    let cards = Array.from(root.querySelectorAll('[role="article"]'));
    if (cards.length === 0) {
      const links = Array.from(root.querySelectorAll('a[href*="/maps/place/"]'));
      const parents = new Set(links.map((l) => l.closest("li, [jsaction], [data-result-index]") || l.parentElement));
      cards = Array.from(parents).filter(Boolean);
    }
    return cards.map((c) => {
      try {
        return parseCard(c);
      } catch (_) {
        return null;
      }
    }).filter((r) => r && r.business_name);
  }

  // src/content/maps.mjs
  var PANEL_ID = "garimpo-maps-panel";
  async function init() {
    mountPanel();
    await renderAuth();
    window.addEventListener("popstate", () => syncCount());
    const obs = new MutationObserver(debounce(syncCount, 800));
    obs.observe(document.body, { childList: true, subtree: true });
    syncCount();
  }
  function mountPanel() {
    if (document.getElementById(PANEL_ID)) return;
    const panel = document.createElement("div");
    panel.id = PANEL_ID;
    panel.innerHTML = `
    <div class="gm-head">
      <span class="gm-mark">4Y</span>
      <span class="gm-title">Capturar do Maps</span>
      <button class="gm-min" title="Minimizar painel" aria-label="Minimizar painel">\u2212</button>
    </div>
    <div class="gm-body">
      <!-- login (some quando logado) -->
      <div class="gm-login" id="gm-login" style="display:none">
        <p class="gm-hint">Entre com sua conta 4YU CRM pra capturar os negocios direto na sua fila.</p>
        <input class="gm-input" id="gm-email" type="email" placeholder="voce@exemplo.com" autocomplete="username" />
        <input class="gm-input" id="gm-pass" type="password" placeholder="sua senha" autocomplete="current-password" />
        <button class="gm-capture" id="gm-login-btn">Entrar</button>
        <p class="gm-result" id="gm-login-msg"></p>
      </div>
      <!-- captura (some quando deslogado) -->
      <div class="gm-capture-box" id="gm-capture-box" style="display:none">
        <p class="gm-hint">Abra uma busca no Google Maps. Eu leio os negocios visiveis e jogo os novos na sua fila.</p>
        <button class="gm-capture" id="gm-capture-btn" disabled>Capturar</button>
        <p class="gm-count" id="gm-count"></p>
        <p class="gm-result" id="gm-result"></p>
        <button class="gm-logout" id="gm-logout-btn" title="Sair">Sair da conta</button>
      </div>
    </div>`;
    document.body.append(panel);
    panel.querySelector(".gm-min").addEventListener("click", () => panel.classList.toggle("gm-collapsed"));
    document.getElementById("gm-capture-btn").addEventListener("click", runCapture);
    document.getElementById("gm-login-btn").addEventListener("click", doLogin);
    document.getElementById("gm-logout-btn").addEventListener("click", async () => {
      await logout();
      await renderAuth();
    });
  }
  async function renderAuth() {
    const cfg = await getConfig();
    const logged = !!cfg.accessToken;
    const login = document.getElementById("gm-login");
    const box = document.getElementById("gm-capture-box");
    if (login) login.style.display = logged ? "none" : "";
    if (box) box.style.display = logged ? "" : "none";
    if (logged) syncCount();
  }
  async function doLogin() {
    const btn = document.getElementById("gm-login-btn");
    const msg = document.getElementById("gm-login-msg");
    const email = (document.getElementById("gm-email").value || "").trim();
    const pass = document.getElementById("gm-pass").value || "";
    if (!email || !pass) {
      if (msg) {
        msg.textContent = "Preencha e-mail e senha.";
        msg.className = "gm-result gm-err";
      }
      return;
    }
    btn.disabled = true;
    btn.textContent = "Entrando...";
    try {
      const cfg = await getConfig();
      await loginWithPassword(cfg, email, pass);
      if (msg) msg.textContent = "";
      await renderAuth();
    } catch (e) {
      if (msg) {
        msg.textContent = `Nao consegui entrar: ${e.message}`;
        msg.className = "gm-result gm-err";
      }
    } finally {
      btn.disabled = false;
      btn.textContent = "Entrar";
    }
  }
  function syncCount() {
    const results = parseResultsList(document);
    const btn = document.getElementById("gm-capture-btn");
    const countEl = document.getElementById("gm-count");
    if (!btn) return;
    if (results.length === 0) {
      btn.disabled = true;
      btn.textContent = "Capturar";
      if (countEl) countEl.textContent = "Nenhum resultado visivel ainda.";
      return;
    }
    btn.disabled = false;
    btn.textContent = `Capturar ${results.length} negocio${results.length > 1 ? "s" : ""}`;
    if (countEl) countEl.textContent = "";
  }
  async function runCapture() {
    const btn = document.getElementById("gm-capture-btn");
    const resultEl = document.getElementById("gm-result");
    const countEl = document.getElementById("gm-count");
    if (!btn) return;
    const leads = parseResultsList(document);
    if (leads.length === 0) {
      if (resultEl) resultEl.textContent = "Nenhum negocio encontrado na lista atual.";
      return;
    }
    btn.disabled = true;
    btn.textContent = "Inserindo...";
    if (resultEl) resultEl.textContent = "";
    if (countEl) countEl.textContent = "";
    let cfg;
    try {
      cfg = await getConfig();
      await ensureFreshToken(cfg);
      cfg = await getConfig();
    } catch (e) {
      showResult(`Erro ao ler configuracao: ${e.message}`, true);
      btn.disabled = false;
      syncCount();
      return;
    }
    if (!cfg.accessToken) {
      showResult("Faca login na sua conta 4YU CRM aqui em cima pra capturar.", true);
      btn.disabled = false;
      await renderAuth();
      return;
    }
    const repo = createRepo(cfg);
    let inserted = 0;
    let duplicates = 0;
    let errors = 0;
    for (const lead of leads) {
      try {
        const id = await repo.insertLead(lead);
        if (id === null) duplicates++;
        else inserted++;
      } catch (e) {
        errors++;
        console.warn("[4yu-crm] erro ao inserir lead:", lead.business_name, e.message);
      }
    }
    const parts = [];
    if (inserted > 0) parts.push(`${inserted} capturado${inserted > 1 ? "s" : ""}`);
    if (duplicates > 0) parts.push(`${duplicates} repetido${duplicates > 1 ? "s" : ""}`);
    if (errors > 0) parts.push(`${errors} com erro`);
    const base = parts.length ? parts.join(", ") : "Nada novo para capturar";
    const msg = inserted > 0 ? `${base}. Ja estao na sua fila, a IA vai analisar e enriquecer.` : base;
    showResult(msg, errors > 0 && inserted === 0);
    btn.disabled = false;
    btn.textContent = `Capturar ${leads.length} negocio${leads.length > 1 ? "s" : ""}`;
  }
  function showResult(msg, isError = false) {
    const el = document.getElementById("gm-result");
    if (!el) return;
    el.textContent = msg;
    el.className = isError ? "gm-result gm-err" : "gm-result gm-ok";
  }
  function debounce(fn, ms) {
    let t;
    return (...args) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...args), ms);
    };
  }
  init().catch((e) => console.error("[4yu-crm-maps]", e));
})();
