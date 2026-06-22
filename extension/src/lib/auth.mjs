// Auth do Supabase pela extensao: troca e-mail/senha por token (login no card)
// e renova o token sozinho pelo refresh_token (sessao longa, sem cair a cada 1h).
import { setConfig } from "./config.mjs";

async function tokenRequest(cfg, grantType, payload) {
  const url = cfg.supabaseUrl.replace(/\/$/, "");
  const r = await fetch(`${url}/auth/v1/token?grant_type=${grantType}`, {
    method: "POST",
    headers: { apikey: cfg.anonKey, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error_description || data.msg || data.error || `HTTP ${r.status}`);
  return data;
}

async function saveSession(d) {
  await setConfig({
    accessToken: d.access_token,
    refreshToken: d.refresh_token,
    expiresAt: Date.now() + (d.expires_in ?? 3600) * 1000,
    dataSource: "supabase",
  });
}

// Login com e-mail + senha. Salva access/refresh token. Devolve o access_token.
export async function loginWithPassword(cfg, email, password) {
  const d = await tokenRequest(cfg, "password", { email, password });
  await saveSession(d);
  return d.access_token;
}

// Garante um token valido: se expirou (ou esta perto), renova pelo refresh_token.
// Devolve o token atual (renovado ou nao), ou null se nao ha sessao.
export async function ensureFreshToken(cfg) {
  if (!cfg.accessToken) return null;
  const near = cfg.expiresAt && Date.now() > cfg.expiresAt - 120000;
  if (!near || !cfg.refreshToken) return cfg.accessToken;
  try {
    const d = await tokenRequest(cfg, "refresh_token", { refresh_token: cfg.refreshToken });
    await saveSession(d);
    return d.access_token;
  } catch {
    return cfg.accessToken; // refresh falhou; usa o atual (pode cair no login dps)
  }
}

export async function logout() {
  await setConfig({ accessToken: "", refreshToken: "", expiresAt: 0 });
}
