// Content script do Google Maps — captacao B7.
// Injeta um painel discreto que le os cards de resultado da busca atual e
// insere os negocios no Supabase como leads 'bruto' (a esteira enriquece e
// pontua depois, sozinha). Nunca altera o DOM do Maps, nunca envia mensagens.
//
// Precisa de LOGIN: a insercao usa o JWT do dono (RLS), entao o lead cai na
// conta dele. Sem login, o painel mostra um formulario de e-mail/senha (o mesmo
// do card do WhatsApp); nao captura no mock as escondidas.

import { getConfig } from "../lib/config.mjs";
import { ensureFreshToken, loginWithPassword, logout } from "../lib/auth.mjs";
import { createRepo } from "../lib/repo.mjs";
import { parseResultsList } from "../lib/maps-parse.mjs";

const PANEL_ID = "garimpo-maps-panel";

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
      <button class="gm-min" title="Minimizar painel" aria-label="Minimizar painel">−</button>
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

// Mostra login ou captura conforme ha sessao.
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
    if (msg) { msg.textContent = "Preencha e-mail e senha."; msg.className = "gm-result gm-err"; }
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
    if (msg) { msg.textContent = `Nao consegui entrar: ${e.message}`; msg.className = "gm-result gm-err"; }
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

  // Garante um token valido (renova se expirou) ANTES de inserir.
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

  // Sem sessao: nao captura (evita jogar no mock as escondidas). Pede login.
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
