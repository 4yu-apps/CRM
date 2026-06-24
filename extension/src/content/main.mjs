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
  loggedIn: false,
  lastKey: "",
  lastName: "", // nome da conversa aberta (chave do casamento lembrado)
  manual: {}, // { nomeDaConversa: telefone } — casamento por numero, lembrado
};

const EDIT_FIELDS = [
  { key: "owner_name", label: "Dono / responsavel", type: "text" },
  { key: "phone", label: "Telefone", type: "text" },
  { key: "whatsapp", label: "WhatsApp", type: "text" },
  { key: "email", label: "E-mail", type: "text" },
  { key: "instagram", label: "Instagram", type: "text" },
  { key: "deal_value", label: "Orcamento (R$)", type: "number" },
  { key: "meeting_link", label: "Link da reuniao (online)", type: "text" },
  { key: "meeting_location", label: "Local (presencial)", type: "text" },
];

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

// Stub: a versao real (com o elemento de indicador) entra na Task 6.
// Definir aqui evita ReferenceError quando o loop chama durante a Task 5.
function updateSweepIndicator() {}

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
    for (const lead of sweepTargets(state.leads)) {
      if (document.hidden) break;            // so com a aba visivel
      if (!(await quota.canCheck())) break;  // respeita o teto diario
      const verdict = await waCheck(lead.whatsapp || lead.phone);
      await quota.record();
      if (verdict === "none") {
        const updated = await state.repo.markNoWhatsapp(lead);
        state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
      } else if (verdict === "has") {
        const updated = await state.repo.markChecked(lead.id);
        state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...updated } : l));
      }
      // unknown: nao mexe, tenta na proxima rodada
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
  if (!lead || lead.archived) return;
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

function mountPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const panel = el("div", { id: PANEL_ID });
  panel.innerHTML = `
    <div class="gp-head">
      <span class="gp-mark">4Y</span>
      <span class="gp-logo">4YU CRM</span>
      <span class="gp-src"></span>
      <button class="gp-logout" title="Sair" aria-label="Sair" style="display:none">⎋</button>
      <button class="gp-min" title="Minimizar painel" aria-label="Minimizar painel">−</button>
      <button class="gp-close" title="Fechar painel" aria-label="Fechar painel">×</button>
    </div>
    <div class="gp-body"></div>
    <div class="gp-foot">So le seu WhatsApp. Status e edicoes vao pro 4YU CRM.</div>`;
  document.body.append(panel);
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
  if (src) src.textContent = state.loggedIn ? "SUPABASE" : "LOGIN";
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
    body.append(el("p", { className: "gp-muted", textContent: "Varios leads possiveis:" }));
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
  body.append(el("p", { className: "gp-muted", textContent: `Nao achei lead pra: ${who}` }));
  body.append(el("p", { className: "gp-hint", textContent: "Cole o numero do contato uma vez — eu lembro dele nas proximas." }));
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
        onclick: () => doTransition(lead.id, b.to, b.label),
      }));
    }
    card.append(row);
  }

  // Edicao sempre aberta: dono, contato, orcamento, reuniao e anotacoes ja
  // visiveis. Escreve so no nosso banco.
  card.append(editForm(lead));
  return card;
}

function editForm(lead) {
  const form = el("div", { className: "gp-edit" });
  const inputs = {};

  for (const f of EDIT_FIELDS) {
    const inp = el("input", {
      className: "gp-input",
      type: f.type,
      value: lead[f.key] != null ? String(lead[f.key]) : "",
    });
    inputs[f.key] = inp;
    form.append(field(f.label, inp));
  }

  const mAt = el("input", { className: "gp-input", type: "datetime-local", value: toLocalInput(lead.meeting_at) });
  inputs.meeting_at = mAt;
  form.append(field("Reuniao (data/hora)", mAt));

  const notes = el("textarea", { className: "gp-input gp-textarea", rows: 3 });
  notes.value = lead.notes || "";
  inputs.notes = notes;
  form.append(field("Anotacoes", notes));

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
      state.leads = state.leads.map((l) => (l.id === lead.id ? { ...l, ...patch, ...(updated || {}) } : l));
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
  const input = el("input", { className: "gp-input", type: "text", placeholder: "Colar numero do contato" });
  const go = el("button", { className: "gp-btn", textContent: "Buscar" });
  const apply = () => {
    const p = parsePhone(input.value);
    if (!p) return toast("numero invalido", true);
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
