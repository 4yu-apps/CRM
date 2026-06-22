// Configuracao via chrome.storage.local. Os defaults ja vem com o banco de
// producao embutido (URL + anon key sao publicas, protegidas por RLS), entao o
// usuario NAO precisa configurar nada: e so logar (e-mail + senha) no proprio
// card. accessToken/refreshToken sao preenchidos pelo login.
//
// Em ambiente sem chrome (testes Node), nao ha sessao logada (accessToken vazio),
// entao activeDataSource cai pro mock — os testes seguem offline/deterministicos.

const DEFAULTS = {
  dataSource: "supabase", // mock | supabase (ja vem supabase)
  supabaseUrl: "https://uqwnpuonrbupsqstetww.supabase.co",
  anonKey: "sb_publishable_qSYj4Gyj4r7BZVQqpJnfAQ_4LwxEdtw",
  accessToken: "", // JWT do usuario logado (RLS) — vem do login no card
  refreshToken: "", // renova o token sozinho (sessao longa, sem cair a cada 1h)
  expiresAt: 0, // epoch ms de expiracao do accessToken
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

// So usa supabase de verdade quando ha um usuario logado (accessToken). Sem
// token, fica no mock — evita bater no banco sem identidade (RLS bloquearia).
export function activeDataSource(cfg) {
  return cfg.dataSource === "supabase" && cfg.supabaseUrl && cfg.anonKey && cfg.accessToken
    ? "supabase"
    : "mock";
}
