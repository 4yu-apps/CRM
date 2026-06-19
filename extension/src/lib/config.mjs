// Configuracao via chrome.storage.local. Sem nada salvo: modo mock (offline).
// Em ambiente sem chrome (testes Node), retorna o default mock.

const DEFAULTS = {
  dataSource: "mock", // mock | supabase
  supabaseUrl: "",
  anonKey: "",
  accessToken: "", // JWT do usuario logado (RLS)
};

export async function getConfig() {
  if (typeof chrome === "undefined" || !chrome.storage) return { ...DEFAULTS };
  const stored = await chrome.storage.local.get(Object.keys(DEFAULTS));
  return { ...DEFAULTS, ...stored };
}

export async function setConfig(patch) {
  if (typeof chrome === "undefined" || !chrome.storage) return;
  await chrome.storage.local.set(patch);
}

export function activeDataSource(cfg) {
  return cfg.dataSource === "supabase" && cfg.supabaseUrl && cfg.anonKey ? "supabase" : "mock";
}
