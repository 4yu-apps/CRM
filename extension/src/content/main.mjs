// Card lateral READ-ONLY sobre o WhatsApp Web. Le a conversa aberta, casa com
// o lead no nosso banco e mostra botoes de status contextuais. NUNCA envia,
// NUNCA injeta texto no WhatsApp, NUNCA raspa contato em massa. A unica escrita
// e o status do lead no NOSSO banco (via repo).
import { getConfig } from "../lib/config.mjs";
import { createRepo } from "../lib/repo.mjs";
import { matchLead, parsePhone } from "../lib/match.mjs";
import { contextualButtons, STATUS_LABEL } from "../lib/state-machine.mjs";
import { fmtPhone } from "../lib/normalize.mjs";

const PANEL_ID = "garimpo-panel";
let repo = null;
let leads = [];
let manualPhone = null; // override do "colar numero"
let lastKey = "";

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

// ---- leitura do DOM (defensiva; selectors do WA mudam) ----
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

async function doTransition(id, to, label) {
  try {
    const updated = await repo.transition(id, to);
    leads = leads.map((l) => (l.id === id ? { ...l, ...updated, status: to } : l));
    toast(`Status: ${label}`);
    evaluate(true);
  } catch (e) {
    toast(`Erro: ${e.message}`, true);
  }
}

// ---- UI ----
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
      <button class="gp-min" title="Minimizar painel" aria-label="Minimizar painel">−</button>
    </div>
    <div class="gp-body"></div>
    <div class="gp-foot">Somente leitura. Quem envia e voce.</div>`;
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
        textContent: `${c.business_name} · ${STATUS_LABEL[c.status]}`,
        onclick: () => renderBody(parsed, { lead: c, method: "name" }),
      }));
    }
    return;
  }
  // nenhum match -> mostra o que leu + fallback manual
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
        onclick: () => doTransition(lead.id, b.to, b.label),
      }));
    }
    card.append(row);
  }
  return card;
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
    manualPhone = null; // one-shot; o proximo evaluate volta a ler o DOM
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
