// Content script do Google Maps — captacao B7.
// Injeta um painel discreto que le os cards de resultado da busca atual
// e insere os negocios no Supabase como leads 'bruto' via insertLead.
// Nunca altera o DOM do Maps, nunca envia mensagens, nunca abre URLs.

import { getConfig } from "../lib/config.mjs";
import { createRepo } from "../lib/repo.mjs";
import { parseResultsList } from "../lib/maps-parse.mjs";

const PANEL_ID = "garimpo-maps-panel";

// ---- inicializacao ----
async function init() {
  mountPanel();
  // Reanalisa a lista sempre que o Maps navega (SPA via pushState/hashchange).
  window.addEventListener("popstate", () => syncCount());
  // MutationObserver para detectar carga dos resultados (lista muda com SPA).
  const obs = new MutationObserver(debounce(syncCount, 800));
  obs.observe(document.body, { childList: true, subtree: true });
  syncCount();
}

// ---- painel ----
function mountPanel() {
  if (document.getElementById(PANEL_ID)) return;
  const panel = document.createElement("div");
  panel.id = PANEL_ID;
  panel.innerHTML = `
    <div class="gm-head">
      <span class="gm-logo">Garimpo</span>
      <button class="gm-min" title="minimizar">_</button>
    </div>
    <div class="gm-body">
      <p class="gm-hint">Busque negocios no Maps e clique para capturar.</p>
      <button class="gm-capture" id="gm-capture-btn" disabled>Capturar</button>
      <p class="gm-count" id="gm-count"></p>
      <p class="gm-result" id="gm-result"></p>
    </div>`;
  document.body.append(panel);
  panel.querySelector(".gm-min").addEventListener("click", () => {
    panel.classList.toggle("gm-collapsed");
  });
  document.getElementById("gm-capture-btn").addEventListener("click", runCapture);
}

// Atualiza o label do botao com o numero de cards encontrados.
function syncCount() {
  const results = parseResultsList(document);
  const btn = document.getElementById("gm-capture-btn");
  const countEl = document.getElementById("gm-count");
  if (!btn) return;
  if (results.length === 0) {
    btn.disabled = true;
    btn.textContent = "Capturar";
    if (countEl) countEl.textContent = "Nenhum negocio visivel na lista.";
    return;
  }
  btn.disabled = false;
  btn.textContent = `Capturar ${results.length} negocio${results.length > 1 ? "s" : ""}`;
  if (countEl) countEl.textContent = "";
}

// ---- captura ----
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
  } catch (e) {
    showResult(`Erro ao ler configuracao: ${e.message}`, true);
    btn.disabled = false;
    syncCount();
    return;
  }

  const repo = createRepo(cfg);

  // Se o repo for mock, avisa o usuario mas continua (util pra testar UI).
  const isMock = repo.source === "mock";

  let inserted = 0;
  let duplicates = 0;
  let errors = 0;

  for (const lead of leads) {
    try {
      const id = await repo.insertLead(lead);
      if (id === null) {
        duplicates++;
      } else {
        inserted++;
      }
    } catch (e) {
      errors++;
      console.warn("[garimpo] erro ao inserir lead:", lead.business_name, e.message);
    }
  }

  const parts = [];
  if (inserted > 0) parts.push(`${inserted} capturado${inserted > 1 ? "s" : ""}`);
  if (duplicates > 0) parts.push(`${duplicates} repetido${duplicates > 1 ? "s" : ""}`);
  if (errors > 0) parts.push(`${errors} com erro`);
  const msg = parts.join(", ") + (isMock ? " (modo mock)" : "");

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

// ---- utilitarios ----
function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

init().catch((e) => console.error("[garimpo-maps]", e));
