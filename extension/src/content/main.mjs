// Card lateral sobre o WhatsApp Web. Le a conversa aberta, casa com o lead no
// nosso banco e deixa atualizar status + editar o lead (notas, contato, dono,
// orcamento, reuniao). READ-ONLY sobre o WhatsApp: NUNCA envia, NUNCA injeta
// texto, NUNCA raspa contato em massa. A unica escrita e no NOSSO banco.
//
// Plug-and-play: ja vem apontado pro banco de producao (config.mjs); o usuario
// so loga (e-mail+senha) no proprio card. O casamento por numero fica LEMBRADO
// por contato (cola uma vez, vale pra sempre, sobrevive a reload).
import { getConfig, setConfig } from "../lib/config.mjs";
import { ensureFreshToken, loginWithPassword, logout } from "../lib/auth.mjs";
import { createRepo } from "../lib/repo.mjs";
import { undoFields as undoFieldsForCard } from "../lib/repo.mjs";
import { listAnexos, uploadAnexo, signAnexo, deleteAnexo, humanSize, MAX_BYTES } from "../lib/anexos.mjs";
import { matchLead, parsePhone } from "../lib/match.mjs";
import { contextualButtons, STATUS_LABEL } from "../lib/state-machine.mjs";
import { fmtPhone, normalizePhone, phoneKey } from "../lib/normalize.mjs";
import { makeQuota, SWEEP_MIN_INTERVAL_MS } from "../lib/wa-quota.mjs";

const PANEL_ID = "garimpo-panel";
const LAUNCHER_ID = "garimpo-launcher";
// Preferencia de painel fechado (por origem, ex: web.whatsapp.com). Fechar de
// vez esconde o painel e deixa so o launcher; fica fechado ate o usuario reabrir.
const CLOSED_KEY = "garimpo-panel-closed";
const state = {
  cfg: null,
  repo: null,
  leads: [],
  templates: [],
  loggedIn: false,
  lastKey: "",
  lastName: "", // nome da conversa aberta (chave do casamento lembrado)
  manual: {}, // { nomeDaConversa: telefone }: casamento por numero, lembrado
};

const EDIT_FIELDS = [
  { key: "owner_name", label: "Dono / responsável", type: "text", icon: "person" },
  { key: "phone", label: "Telefone", type: "text", icon: "phone" },
  { key: "whatsapp", label: "WhatsApp", type: "text", icon: "whatsapp" },
  { key: "email", label: "E-mail", type: "text", icon: "email" },
  { key: "instagram", label: "Instagram", type: "text", icon: "instagram" },
  { key: "deal_value", label: "Orçamento", type: "number" },
  { key: "meeting_link", label: "Link da reunião (online)", type: "text", icon: "link" },
  { key: "meeting_location", label: "Local (presencial)", type: "text", icon: "pin" },
];

// Icones de prefixo dos campos (inline SVG, herda a cor via currentColor).
const ICONS = {
  person:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/></svg>',
  phone:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h4l2 5-3 2a14 14 0 0 0 6 6l2-3 5 2v4a2 2 0 0 1-2 2A18 18 0 0 1 3 5a2 2 0 0 1 2-2"/></svg>',
  whatsapp:
    '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-8.6 15l-1.3 4.6 4.8-1.3A10 10 0 1 0 12 2m0 2a8 8 0 0 1 5.7 13.6 8 8 0 0 1-9.8 1.2l-.4-.2-2.4.6.6-2.3-.2-.4A8 8 0 0 1 12 4m-3.1 4c-.2 0-.4 0-.6.4-.3.4-.9 1-.9 2.2s.9 2.5 1 2.7c.2.2 1.8 3 4.5 4 .6.3 1.1.4 1.5.3.5-.1 1.4-.6 1.6-1.2.2-.6.2-1 .1-1.2l-.7-.3-1.4-.7c-.2-.1-.4-.1-.5.1l-.6.8c-.1.2-.3.2-.5.1a6 6 0 0 1-2.9-2.6c-.1-.2 0-.4.1-.5l.4-.5c.1-.2.1-.3 0-.5l-.7-1.4c-.1-.3-.3-.3-.4-.3z"/></svg>',
  email:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>',
  instagram:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.1" fill="currentColor" stroke="none"/></svg>',
  link:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 15 15 9"/><path d="M11 6.5 13 4.5a4 4 0 0 1 6 6l-2 2"/><path d="M13 17.5 11 19.5a4 4 0 0 1-6-6l2-2"/></svg>',
  pin:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11"/><circle cx="12" cy="10" r="2.5"/></svg>',
  calendar:
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 9h18M8 3v4M16 3v4"/></svg>',
};

// ---- waCheck: consulta o glue (mundo MAIN) sobre existencia no WhatsApp ----
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
    setTimeout(() => { window.removeEventListener("message", onMsg); resolve("unknown"); }, 8000);
  });
}

// ---- varredura proativa throttled ----
const quota = makeQuota({});
let sweeping = false;

function updateSweepIndicator() {
  const elx = document.getElementById("gp-sweep");
  if (!elx) return;
  const total = sweepTargets(state.leads).length;
  elx.textContent = sweeping && total > 0 ? `validando números... faltam ${total}` : "";
}

function jitter() { return SWEEP_MIN_INTERVAL_MS + Math.floor(Math.random() * 2000); }
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Alvos: na fila, nao arquivados, ainda nao checados. Mais antigos primeiro.
function sweepTargets(leads) {
  return leads
    .filter((l) => (l.status === "rascunho_pronto" || l.status === "aprovado") && !l.archived && !l.whatsapp_checked_at)
    .filter((l) => l.whatsapp || l.phone)
    .sort((a, b) => new Date(a.updated_at) - new Date(b.updated_at));
}

async function runSweep() {
  if (sweeping) return;
  sweeping = true;
  try {
    let unknownSeguidos = 0;
    for (const lead of sweepTargets(state.leads)) {
      if (document.hidden) break;            // so com a aba visivel
      if (!(await quota.canCheck())) break;  // respeita o teto diario
      const verdict = await waCheck(lead.whatsapp || lead.phone);
      await quota.record();                  // toda checagem conta (anti-ban e por chamada)
      if (verdict === "none") {
        unknownSeguidos = 0;
        const updated = await state.repo.markNoWhatsapp(lead);
        state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
      } else if (verdict === "has") {
        unknownSeguidos = 0;
        const updated = await state.repo.markChecked(lead.id);
        state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
      } else {
        // unknown: provavelmente a sessao do WhatsApp nao esta pronta. Se persistir,
        // para a varredura pra nao gastar a cota do dia chamando uma sessao morta.
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

// Dispara varredura ao voltar o foco da aba
document.addEventListener("visibilitychange", () => { if (!document.hidden) void runSweep(); });

// ---- rede no clique: reage ao evento no_whatsapp emitido pelo glue ----
window.addEventListener("message", async (e) => {
  if (e.source !== window) return;
  const d = e.data;
  if (!d || d.source !== "garimpo-page" || d.type !== "no_whatsapp") return;
  const key = phoneKey(d.phone);
  const lead = state.leads.find((l) => phoneKey(l.whatsapp || l.phone) === key);
  if (!lead || lead.archived || lead.whatsapp_checked_at) return;
  const updated = await state.repo.markNoWhatsapp(lead);
  state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
  toast("Número sem WhatsApp. Arquivei e marquei sem-whatsapp.");
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
    try {
      state.templates = await state.repo.listTemplates();
    } catch {
      state.templates = [];
    }
    void runSweep();
  }
  updateBadge();
  evaluate(true);
  // mantem o token vivo em sessoes longas (renova sozinho a cada ~45min)
  setInterval(keepAlive, 45 * 60 * 1000);
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
    // token caiu -> volta pro login
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

// Acha o numero do contato da conversa ABERTA, mesmo quando ele esta salvo (o
// header so mostra o nome). O WhatsApp embute o numero no data-id das mensagens
// ("false_554488557262@c.us_XXXX"); pegamos de qualquer bolha. So 1:1 (@c.us);
// grupo (@g.us) e ignorado. Devolve normalizado (tira o 55) ou null.
function readPhoneFromChat() {
  const main = document.querySelector("#main");
  if (!main) return null;
  const node = main.querySelector('[data-id*="@c.us"]');
  if (!node) return null;
  const m = (node.getAttribute("data-id") || "").match(/(\d{10,15})@c\.us/);
  return m ? normalizePhone(m[1]) : null;
}

// Verifica se a conversa aberta tem pelo menos uma mensagem RECEBIDA (bubble "in").
// Conservador: qualquer elemento com classe contendo "message-in" ja e suficiente.
// Nunca lanca excecao, pois o DOM do WhatsApp muda sem aviso. Devolve false em
// qualquer erro ou quando nao da pra ler o painel.
function chatTemRespostaRecebida() {
  try {
    const main = document.querySelector("#main");
    if (!main) return false;
    // WhatsApp usa classes como "message-in" nas bolhas recebidas.
    return main.querySelector('[class*="message-in"]') !== null;
  } catch {
    return false;
  }
}

// ---- leitura do DOM (defensiva; selectors do WA mudam) ----
function readConversation() {
  const header = document.querySelector("#main header") || document.querySelector("header");
  if (!header) return { name: null, phone: null, rawName: "" };
  const titleEl = header.querySelector("span[title]") || header.querySelector('span[dir="auto"]');
  const rawName = titleEl ? (titleEl.getAttribute("title") || titleEl.textContent || "").trim() : "";
  const phoneFromName = parsePhone(rawName);
  // 1) numero no header (contato nao salvo)  2) numero embutido nas mensagens
  // (contato salvo)  3) numero no texto do header  4) casamento lembrado.
  let phone = phoneFromName || readPhoneFromChat() || parsePhone(header.textContent);
  const name = phoneFromName ? null : rawName;
  if (!phone && rawName && state.manual[rawName]) phone = state.manual[rawName];
  return { name, phone, rawName };
}

function evaluate(force = false) {
  if (!state.loggedIn) {
    // sem login: mostra o formulario de login (sem re-render a cada mutacao,
    // pra nao apagar o que o usuario esta digitando).
    if (state.lastKey === "__login__" && !force) return;
    state.lastKey = "__login__";
    renderLogin();
    return;
  }
  const parsed = readConversation();
  state.lastName = parsed.rawName || "";
  const key = `${parsed.phone || ""}|${parsed.name || ""}`;
  if (!force && key === state.lastKey) return; // mesma conversa: nao re-renderiza
  state.lastKey = key;
  renderBody(parsed, matchLead(parsed, state.leads));
}

async function doTransition(id, to, label) {
  try {
    const updated = await state.repo.transition(id, to);
    state.leads = state.leads.map((l) => (l.id === id ? { ...l, ...updated, status: to } : l));
    toast(`Status: ${label}`);
    evaluate(true);
  } catch (e) {
    toast(`Erro: ${e.message}`, true);
  }
}

// ---- UI helpers ----
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

function iconEl(name) {
  const s = el("span", { className: "gp-ic" });
  s.innerHTML = ICONS[name] || "";
  return s;
}

// Campo com prefixo: icone (opts.icon) OU texto (opts.text, ex. "R$").
function fieldPrefixed(label, control, opts = {}) {
  const wrap = el("label", { className: "gp-field" });
  wrap.append(el("span", { className: "gp-flabel", textContent: label }));
  if (opts.icon || opts.text) {
    const inwrap = el("div", { className: "gp-inwrap" });
    control.classList.add("gp-input--pad");
    const pfx = opts.text
      ? el("span", { className: "gp-pfx", textContent: opts.text })
      : iconEl(opts.icon);
    inwrap.append(pfx, control);
    wrap.append(inwrap);
  } else {
    wrap.append(control);
  }
  return wrap;
}

// Formata centavos no padrao BR: 1.234,56
function formatBRL(cents) {
  const s = (cents / 100).toFixed(2);
  const [intp, dec] = s.split(".");
  return `${intp.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${dec}`;
}

// Input de moeda: conforme digita, formata e acumula os centavos.
function brlInput(initialReais) {
  const inp = el("input", { className: "gp-input", type: "text", inputMode: "numeric" });
  let cents = 0;
  const hadValue = initialReais != null && initialReais !== "" && !Number.isNaN(Number(initialReais));
  if (hadValue) cents = Math.round(Number(initialReais) * 100);
  inp.value = hadValue ? formatBRL(cents) : "";
  inp.addEventListener("input", () => {
    const digits = inp.value.replace(/\D/g, "");
    cents = digits ? parseInt(digits, 10) : 0;
    inp.value = digits ? formatBRL(cents) : "";
  });
  inp.getReais = () => (inp.value === "" ? null : cents / 100);
  return inp;
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
      <button class="gp-logout" title="Sair" aria-label="Sair" style="display:none">⎋</button>
      <button class="gp-min" title="Minimizar painel" aria-label="Minimizar painel">−</button>
      <button class="gp-close" title="Fechar painel" aria-label="Fechar painel">×</button>
    </div>
    <div class="gp-body"></div>
    <div class="gp-foot">Só lê seu WhatsApp. Status e edições vão pro 4YU CRM.</div>`;
  document.body.append(panel);
  // Injeta o icone real da extensao no .gp-mark (evita texto tecnico "4Y")
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

  // Launcher pra reabrir quando o painel e fechado de vez.
  const launcher = el("button", { id: LAUNCHER_ID, title: "Abrir 4YU CRM", textContent: "4Y" });
  launcher.setAttribute("aria-label", "Abrir 4YU CRM");
  document.body.append(launcher);

  // Fecha de vez (esconde o painel, mostra o launcher) e lembra a escolha.
  const setClosed = (closed) => {
    panel.style.display = closed ? "none" : "";
    launcher.style.display = closed ? "flex" : "none";
    try { localStorage.setItem(CLOSED_KEY, closed ? "1" : "0"); } catch { /* sem storage */ }
  };
  panel.querySelector(".gp-close").addEventListener("click", () => setClosed(true));
  launcher.addEventListener("click", () => setClosed(false));
  let closedPref = false;
  try { closedPref = localStorage.getItem(CLOSED_KEY) === "1"; } catch { /* ignora */ }
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
    body.append(el("p", { className: "gp-muted", textContent: "Vários leads possíveis:" }));
    for (const c of result.candidates) {
      body.append(el("button", {
        className: "gp-cand",
        textContent: `${c.business_name} · ${STATUS_LABEL[c.status]}`,
        onclick: () => {
          if (state.lastName) {
            state.manual[state.lastName] = c.phone; // lembra a escolha
            saveManual();
          }
          renderBody(parsed, { lead: c, method: "name" });
        },
      }));
    }
    return;
  }
  // nenhum match -> mostra o que leu + colar numero (que fica lembrado)
  const who = parsed.phone ? fmtPhone(parsed.phone) : parsed.name || "conversa";
  body.append(el("p", { className: "gp-muted", textContent: `Não achei lead pra: ${who}` }));
  body.append(el("p", { className: "gp-hint", textContent: "Cole o número do contato uma vez, eu lembro dele nas próximas." }));
  body.append(manualBox());
}

function fillTemplate(body, lead) {
  const nome = (lead.owner_name || "").split(" ")[0] || lead.business_name || "";
  return body
    .replace(/\{nome\}/g, nome)
    .replace(/\{ramo\}/g, lead.category || "")
    .replace(/\{bairro\}/g, lead.neighborhood || "")
    .replace(/\{cidade\}/g, lead.city || "");
}

function waPrefill(text) {
  return new Promise((resolve) => {
    const reqId = `pf-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const onMsg = (e) => {
      if (e.source !== window) return;
      const d = e.data;
      if (!d || d.source !== "garimpo-page" || d.type !== "prefill_result" || d.reqId !== reqId) return;
      window.removeEventListener("message", onMsg);
      resolve(d.ok);
    };
    window.addEventListener("message", onMsg);
    window.postMessage({ source: "garimpo-sw", type: "prefill", text, reqId }, "*");
    setTimeout(() => { window.removeEventListener("message", onMsg); resolve(false); }, 5000);
  });
}

function leadCard(lead, method) {
  const card = el("div", { className: "gp-card" });
  card.append(el("div", { className: "gp-name", textContent: lead.business_name || "Sem nome" }));
  const meta = el("div", { className: "gp-meta" });
  meta.append(el("span", { className: `gp-badge gp-${lead.status}`, textContent: STATUS_LABEL[lead.status] || lead.status }));
  if (lead.phone) meta.append(el("span", { className: "gp-muted", textContent: fmtPhone(lead.phone) }));
  if (lead.score != null) meta.append(el("span", { className: "gp-muted", textContent: `score ${lead.score}` }));
  card.append(meta);
  card.append(el("div", { className: "gp-method", textContent: `casou por ${method === "phone" ? "número" : "nome"}` }));

  if (Array.isArray(lead.tags) && lead.tags.includes("sem-whatsapp")) {
    const box = el("div", { className: "gp-nowa" });
    box.append(el("div", { className: "gp-nowa-title", textContent: "Esse número não tem WhatsApp" }));
    box.append(el("div", { className: "gp-muted", textContent: "Arquivei e marquei com a tag sem-whatsapp." }));
    const row = el("div", { className: "gp-actions" });
    row.append(el("button", {
      className: "gp-btn", textContent: "Desfazer",
      onclick: async () => {
        try {
          const updated = await state.repo.undoNoWhatsapp(lead);
          state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
          toast("Pronto, voltei o lead.");
          evaluate(true);
        } catch (err) { toast(`Erro: ${err.message}`, true); }
      },
    }));
    row.append(el("button", {
      className: "gp-btn", textContent: "Corrigir número",
      onclick: () => openCorrigirNumero(lead),
    }));
    box.append(row);
    card.append(box);
  }

  // Nudge de resposta: quando o lead esta em "enviado" ou "sem_resposta" e a
  // conversa aberta ja tem mensagem recebida, sugere marcar como respondeu.
  // Sem automacao: so mostra o nudge, o clique e do usuario.
  if ((lead.status === "enviado" || lead.status === "sem_resposta") && chatTemRespostaRecebida()) {
    const nudge = el("div", { className: "gp-nudge" });
    nudge.append(el("span", { className: "gp-nudge-text", textContent: "Esse respondeu?" }));
    nudge.append(el("button", {
      className: "gp-btn gp-nudge-btn",
      textContent: "Marcar respondeu",
      onclick: () => doTransition(lead.id, "respondeu", "Respondeu"),
    }));
    card.append(nudge);
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
        onclick: () => doTransition(lead.id, b.to, b.label),
      }));
    }
    card.append(row);
  }

  // Edicao sempre aberta: dono, contato, orcamento, reuniao e anotacoes ja
  // visiveis. Escreve so no nosso banco.
  card.append(editForm(lead));

  const templates = (state.templates || []).slice(0, 6);
  if (templates.length > 0) {
    const section = el("div", { className: "gp-tpl" });
    section.append(el("div", { className: "gp-tpl-title", textContent: "Respostas rápidas" }));
    const btnsRow = el("div", { className: "gp-tpl-btns" });
    for (const tpl of templates) {
      btnsRow.append(el("button", {
        className: "gp-btn gp-tpl-btn",
        textContent: tpl.name,
        onclick: async () => {
          const text = fillTemplate(tpl.body || "", lead);
          const ok = await waPrefill(text);
          if (ok) {
            toast("É só revisar e enviar.");
          } else {
            toast("Não consegui preencher o compositor.", true);
          }
        },
      }));
    }
    section.append(btnsRow);
    card.append(section);
  }

  return card;
}

async function openCorrigirNumero(lead) {
  const novo = window.prompt("Número certo do WhatsApp (só dígitos, com DDD):", lead.whatsapp || lead.phone || "");
  if (novo == null) return;
  try {
    const fields = { ...undoFieldsForCard(lead), whatsapp: novo.replace(/\D/g, "") };
    const updated = await state.repo.updateLead(lead.id, fields);
    state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
    toast("Número corrigido. Vou revalidar.");
    evaluate(true);
    void runSweep();
  } catch (err) { toast(`Erro: ${err.message}`, true); }
}

function editForm(lead) {
  const form = el("div", { className: "gp-edit" });
  const inputs = {};

  for (const f of EDIT_FIELDS) {
    if (f.key === "deal_value") {
      const inp = brlInput(lead.deal_value);
      inputs.deal_value = inp;
      form.append(fieldPrefixed(f.label, inp, { text: "R$" }));
      continue;
    }
    const inp = el("input", {
      className: "gp-input",
      type: f.type,
      value: lead[f.key] != null ? String(lead[f.key]) : "",
    });
    inputs[f.key] = inp;
    form.append(fieldPrefixed(f.label, inp, { icon: f.icon }));
  }

  const mAt = el("input", { className: "gp-input", type: "datetime-local", value: toLocalInput(lead.meeting_at) });
  inputs.meeting_at = mAt;
  form.append(fieldPrefixed("Reunião (data/hora)", mAt, { icon: "calendar" }));

  const notes = el("textarea", { className: "gp-input gp-textarea", rows: 3 });
  notes.value = lead.notes || "";
  inputs.notes = notes;
  form.append(field("Anotações", notes));

  const save = el("button", { className: "gp-save", textContent: "Salvar no lead" });
  save.addEventListener("click", async () => {
    const patch = {};
    for (const f of EDIT_FIELDS) {
      if (f.key === "deal_value") {
        const nv = inputs.deal_value.getReais();
        if (nv !== (lead.deal_value ?? null)) patch.deal_value = nv;
        continue;
      }
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
      state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...patch, ...(updated || {}) } : l));
      toast("Salvo no lead");
      evaluate(true);
    } catch (e) {
      toast(`Erro: ${e.message}`, true);
      save.disabled = false;
    }
  });
  form.append(save);
  form.append(anexosSection(lead));
  return form;
}

// Anexos do lead: arrasta (ou clica) pra subir no bucket privado, lista com
// baixar (URL assinada) e remover. So aparece logado (Storage exige token).
function anexosSection(lead) {
  const wrap = el("div", { className: "gp-anexos" });
  wrap.append(el("span", { className: "gp-flabel", textContent: "Anexos" }));

  if (!state.cfg || !state.cfg.accessToken) {
    wrap.append(el("div", { className: "gp-muted", textContent: "Entre na sua conta pra anexar arquivos." }));
    return wrap;
  }

  const fileInput = el("input", { type: "file", multiple: true, className: "gp-file-hidden" });
  const drop = el("div", { className: "gp-drop", textContent: "Arraste arquivos aqui ou clique pra anexar" });
  const list = el("div", { className: "gp-anexo-list" });
  wrap.append(drop, fileInput, list);

  const reset = () => {
    drop.classList.remove("gp-busy");
    drop.textContent = "Arraste arquivos aqui ou clique pra anexar";
  };

  async function refresh() {
    list.textContent = "";
    let items = [];
    try {
      items = await listAnexos(state.cfg, lead.id);
    } catch {
      list.append(el("div", { className: "gp-muted", textContent: "Não consegui listar os anexos." }));
      return;
    }
    for (const it of items) {
      const row = el("div", { className: "gp-anexo" });
      const name = el("button", { className: "gp-anexo-name", title: "Baixar", textContent: it.name });
      name.addEventListener("click", async () => {
        try {
          const url = await signAnexo(state.cfg, it.path);
          window.open(url, "_blank", "noopener");
        } catch {
          toast("Não consegui abrir o anexo.", true);
        }
      });
      const size = el("span", { className: "gp-anexo-size", textContent: humanSize(it.size) });
      const del = el("button", { className: "gp-anexo-del", title: "Remover", textContent: "×" });
      del.addEventListener("click", async () => {
        del.disabled = true;
        try {
          await deleteAnexo(state.cfg, it.path);
          await refresh();
          toast("Anexo removido.");
        } catch {
          toast("Não consegui remover.", true);
          del.disabled = false;
        }
      });
      row.append(name, size, del);
      list.append(row);
    }
  }

  async function uploadFiles(files) {
    drop.classList.add("gp-busy");
    for (const file of files) {
      if (file.size > MAX_BYTES) {
        toast(`${file.name}: passa de 25 MB.`, true);
        continue;
      }
      drop.textContent = `Enviando ${file.name}...`;
      try {
        await uploadAnexo(state.cfg, lead.id, file);
      } catch {
        toast(`Falha ao enviar ${file.name}.`, true);
      }
    }
    reset();
    await refresh();
  }

  drop.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => {
    if (fileInput.files && fileInput.files.length) void uploadFiles([...fileInput.files]);
    fileInput.value = "";
  });
  ["dragenter", "dragover"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.add("gp-drag");
    }),
  );
  ["dragleave", "drop"].forEach((ev) =>
    drop.addEventListener(ev, (e) => {
      e.preventDefault();
      drop.classList.remove("gp-drag");
    }),
  );
  drop.addEventListener("drop", (e) => {
    const fs = e.dataTransfer && e.dataTransfer.files;
    if (fs && fs.length) void uploadFiles([...fs]);
  });

  void refresh();
  return wrap;
}

// ISO -> valor do input datetime-local (local, sem timezone).
function toLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function manualBox() {
  const box = el("div", { className: "gp-manual" });
  const input = el("input", { className: "gp-input", type: "text", placeholder: "Colar número do contato" });
  const go = el("button", { className: "gp-btn", textContent: "Buscar" });
  const apply = () => {
    const p = parsePhone(input.value);
    if (!p) return toast("número inválido", true);
    if (state.lastName) {
      state.manual[state.lastName] = p; // lembra pra sempre nesse contato
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

let toastTimer = null;
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

// ---- observa troca de conversa ----
function observe() {
  const root = document.querySelector("#app") || document.body;
  const obs = new MutationObserver(() => {
    clearTimeout(observe._t);
    observe._t = setTimeout(() => evaluate(), 400);
  });
  obs.observe(root, { childList: true, subtree: true });
}

init().catch((e) => console.error("[garimpo]", e));
