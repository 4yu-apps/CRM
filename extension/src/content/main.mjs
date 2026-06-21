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

// Campos que dá pra editar/preencher pela extensão (no nosso banco). É por aqui
// que entra o que a pessoa descobre na conversa: nome do dono, contato que
// faltava, orçamento sugerido.
const EDIT_FIELDS = [
  { key: "owner_name", label: "Dono / responsavel", type: "text" },
  { key: "phone", label: "Telefone", type: "text" },
  { key: "whatsapp", label: "WhatsApp", type: "text" },
  { key: "email", label: "E-mail", type: "text" },
  { key: "instagram", label: "Instagram", type: "text" },
  { key: "deal_value", label: "Orcamento (R$)", type: "number" },
  { key: "meeting_link", label: "Link da reuniao", type: "text" },
  { key: "meeting_location", label: "Local (presencial)", type: "text" },
];

// ISO -> valor do input datetime-local (local, sem timezone) e volta.
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

  // Editar/anotar: expande um mini formulario pra preencher o que a conversa
  // revela (nome do dono, contato, orcamento) e anotacoes. Escreve so no banco.
  let form = null;
  const editToggle = el("button", { className: "gp-edit-toggle", textContent: "✎ Editar / anotar" });
  editToggle.addEventListener("click", () => {
    if (form) {
      form.remove();
      form = null;
      editToggle.textContent = "✎ Editar / anotar";
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
      value: lead[f.key] != null ? String(lead[f.key]) : "",
    });
    inputs[f.key] = inp;
    wrap.append(inp);
    form.append(wrap);
  }

  // Reuniao: data/hora (a modalidade sai de ter link ou local preenchido acima).
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
    // reuniao (data/hora): converte o datetime-local pra ISO e so manda se mudou
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
      leads = leads.map((l) => (l.id === lead.id ? { ...l, ...patch, ...(updated || {}) } : l));
      toast("Salvo no lead");
      evaluate(true); // re-renderiza (fecha o form) ja com os dados novos
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
