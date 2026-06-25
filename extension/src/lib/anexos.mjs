// Anexos do lead via Storage REST do Supabase. A extensao nao usa supabase-js;
// fala REST puro com o MESMO token do login (igual o repo.mjs). Bucket privado
// `lead-anexos`, path <uid>/<leadId>/<arquivo> — a RLS exige que o 1o segmento
// do path seja auth.uid(), entao tiramos o uid do proprio JWT (claim `sub`).

const BUCKET = "lead-anexos";
const MAX_BYTES = 25 * 1024 * 1024; // teto do bucket

export { MAX_BYTES };

// Decodifica o uid (sub) do access token, sem dependencia externa.
export function uidFromToken(token) {
  if (!token) return null;
  try {
    let p = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    p += "=".repeat((4 - (p.length % 4)) % 4);
    return JSON.parse(atob(p)).sub || null;
  } catch {
    return null;
  }
}

function storageBase(cfg) {
  return cfg.supabaseUrl.replace(/\/$/, "") + "/storage/v1";
}
function authHeaders(cfg) {
  return { apikey: cfg.anonKey, Authorization: `Bearer ${cfg.accessToken || cfg.anonKey}` };
}

// Pasta do lead pro usuario logado. null = sem sessao.
export function leadPrefix(cfg, leadId) {
  const uid = uidFromToken(cfg && cfg.accessToken);
  return uid ? `${uid}/${leadId}` : null;
}

export async function listAnexos(cfg, leadId) {
  const prefix = leadPrefix(cfg, leadId);
  if (!prefix) return [];
  const r = await fetch(`${storageBase(cfg)}/object/list/${BUCKET}`, {
    method: "POST",
    headers: { ...authHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ prefix, limit: 100, sortBy: { column: "created_at", order: "desc" } }),
  });
  if (!r.ok) throw new Error(`list ${r.status}`);
  const data = await r.json();
  return (Array.isArray(data) ? data : [])
    .filter((o) => o && o.id !== null && o.name) // ignora entradas de "pasta"
    .map((o) => ({
      name: o.name,
      path: `${prefix}/${o.name}`,
      size: (o.metadata && o.metadata.size) || 0,
    }));
}

export async function uploadAnexo(cfg, leadId, file) {
  const prefix = leadPrefix(cfg, leadId);
  if (!prefix) throw new Error("Faça login pra anexar.");
  // Nome saneado; extensao/conteudo nunca dirigem o path alem da propria pasta.
  const safe = file.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "arquivo";
  const path = `${prefix}/${Date.now()}-${safe}`;
  const r = await fetch(`${storageBase(cfg)}/object/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      ...authHeaders(cfg),
      "Content-Type": file.type || "application/octet-stream",
      "x-upsert": "false",
    },
    body: file,
  });
  if (!r.ok) throw new Error(`upload ${r.status}`);
}

export async function signAnexo(cfg, path) {
  const r = await fetch(`${storageBase(cfg)}/object/sign/${BUCKET}/${encodeURI(path)}`, {
    method: "POST",
    headers: { ...authHeaders(cfg), "Content-Type": "application/json" },
    body: JSON.stringify({ expiresIn: 60 }),
  });
  if (!r.ok) throw new Error(`sign ${r.status}`);
  const d = await r.json();
  // REST devolve `signedURL` (U maiusculo); supabase-js usa `signedUrl`.
  // Aceita os dois e ja-absoluto, por seguranca.
  const su = d.signedURL || d.signedUrl || "";
  if (!su) throw new Error("sign: sem URL");
  return su.startsWith("http") ? su : storageBase(cfg) + su;
}

export async function deleteAnexo(cfg, path) {
  const r = await fetch(`${storageBase(cfg)}/object/${BUCKET}/${encodeURI(path)}`, {
    method: "DELETE",
    headers: authHeaders(cfg),
  });
  if (!r.ok) throw new Error(`delete ${r.status}`);
}

// Tamanho legivel pra UI.
export function humanSize(bytes) {
  if (!bytes) return "";
  const u = ["B", "KB", "MB"];
  let i = 0;
  let n = bytes;
  while (n >= 1024 && i < u.length - 1) {
    n /= 1024;
    i += 1;
  }
  const dec = i > 0 && n < 10 && !Number.isInteger(n) ? 1 : 0;
  return `${n.toFixed(dec)} ${u[i]}`;
}
