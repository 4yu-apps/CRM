// Service worker (MV3). Recebe do CRM (via content script bridge) o pedido de
// "abrir conversa" e abre no WhatsApp Web REUSANDO a aba ja aberta: acha a aba,
// foca e navega ELA pra conversa. Assim nao empilha varias abas (o site sozinho
// nao consegue mirar uma aba; a extensao consegue, via chrome.tabs).
//
// Respeita o read-only: NAO envia. So abre a conversa com o texto pre-preenchido
// pela URL oficial do WhatsApp (/send?text=). Quem aperta enviar e o usuario.
//
// Tambem gerencia notificacoes de follow-up: via chrome.alarms (periodico, 1h)
// busca leads com followup_at <= hoje e status nao-final; se houver, dispara
// chrome.notifications com dedupe diario (nao floda a cada hora).

import { getConfig } from "./lib/config.mjs";
import { ensureFreshToken } from "./lib/auth.mjs";
import { createRepo } from "./lib/repo.mjs";

// Statuses que indicam lead encerrado (sem necessidade de follow-up).
const FINAL_STATUSES = new Set(["fechado", "perdido", "sem_interesse", "descartado"]);

// Chave no storage local pra guardar a data do ultimo aviso de follow-up.
const NOTIF_KEY = "gp-followup-notif-date";

// ID fixo da notificacao (substitui a anterior se ainda estiver visivel).
const NOTIF_ID = "gp-followups";

// Alarme periodico que acorda o service worker a cada 1 hora.
chrome.alarms.create("gp-followups", { periodInMinutes: 60 });

// Garante que o alarme existe quando o service worker reinicia.
chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create("gp-followups", { periodInMinutes: 60 });
});

// Verifica follow-ups e dispara notificacao se necessario.
async function checkFollowups() {
  // Monta config e token; se nao ha sessao, sai silenciosamente.
  const cfg = await getConfig();
  const token = await ensureFreshToken(cfg);
  if (!token) return;

  // Usa o token renovado (ou o atual) no repo.
  const cfgWithToken = { ...cfg, accessToken: token };
  const repo = createRepo(cfgWithToken);

  let leads;
  try {
    leads = await repo.listLeads();
  } catch {
    return; // erro de rede ou banco: tenta de novo na proxima hora
  }

  // Fim do dia de hoje (23:59:59.999).
  const todayEnd = new Date();
  todayEnd.setHours(23, 59, 59, 999);
  const todayEndMs = todayEnd.getTime();

  // Filtra leads com follow-up vencido hoje (ou antes) e status nao-final.
  const due = leads.filter((l) => {
    if (!l.followup_at) return false;
    if (FINAL_STATUSES.has(l.status)) return false;
    const d = new Date(l.followup_at).getTime();
    return d <= todayEndMs;
  });

  if (due.length === 0) return;

  // Dedupe: so notifica uma vez por dia.
  const today = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
  const stored = await chrome.storage.local.get(NOTIF_KEY);
  if (stored[NOTIF_KEY] === today) return;

  // Marca o dia antes de disparar (evita duplicata mesmo se a chamada falhar).
  await chrome.storage.local.set({ [NOTIF_KEY]: today });

  const n = due.length;
  const msg =
    n === 1
      ? "Você tem 1 follow-up pra hoje."
      : `Você tem ${n} follow-ups pra hoje.`;

  chrome.notifications.create(NOTIF_ID, {
    type: "basic",
    iconUrl: "icons/icon-128.png",
    title: "4YU CRM",
    message: msg,
    priority: 1,
  });
}

// Ouve o alarme periodico.
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === "gp-followups") {
    checkFollowups();
  }
});

// Clique na notificacao abre o CRM.
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
      // nenhuma aba do WhatsApp aberta: abre uma (unica)
      chrome.tabs.create({ url });
      return;
    }
    const tab = tabs[0];
    // foca a aba existente (reusa, nunca abre nova)
    chrome.tabs.update(tab.id, { active: true });
    if (tab.windowId != null) chrome.windows.update(tab.windowId, { focused: true });
    // 1a tentativa: trocar a conversa SEM reload (wa-js, via relay no content script)
    chrome.tabs.sendMessage(tab.id, { type: "garimpo_switch_chat", phone, text }, (resp) => {
      // fallback: relay ausente, wa-js nao pronto ou nao conseguiu -> navega (reload)
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
