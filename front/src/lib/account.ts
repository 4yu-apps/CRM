// Acoes da conta do usuario sobre o Supabase Auth/Storage. Cada funcao guarda
// o modo mock e traduz erro cru do Supabase pra mensagem amigavel (sem vazar
// detalhe que ajude enumeracao). Trocar email/senha exige reauth com a senha
// atual. Avatar valida tipo/tamanho e usa path fixo por usuario (sem usar o
// nome do arquivo -> sem path traversal).
import { getSupabase } from "@/lib/supabase/client";
import { activeDataSource } from "@/lib/repo";

export const ACCOUNT_MOCK_MSG = "Disponível só no modo real (conectado ao Supabase).";

function ensureReal() {
  if (activeDataSource() !== "supabase") throw new Error(ACCOUNT_MOCK_MSG);
}

// Confere a identidade reentrando com a senha atual antes de uma acao sensivel.
async function reauth(currentPassword: string): Promise<void> {
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const email = data.user?.email;
  if (!email) throw new Error("Sessão expirada. Entre de novo.");
  const { error } = await sb.auth.signInWithPassword({ email, password: currentPassword });
  // Mensagem generica de proposito: nao distingue "senha errada" de outros.
  if (error) throw new Error("Senha atual incorreta.");
}

export async function updateName(name: string): Promise<void> {
  ensureReal();
  const clean = name.trim();
  if (clean.length < 2) throw new Error("Nome muito curto.");
  if (clean.length > 80) throw new Error("Nome muito longo.");
  const { error } = await getSupabase().auth.updateUser({ data: { full_name: clean } });
  if (error) throw new Error("Não consegui salvar o nome. Tente de novo.");
}

export async function updateEmail(newEmail: string, currentPassword: string): Promise<void> {
  ensureReal();
  const email = newEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Email inválido.");
  await reauth(currentPassword);
  const { error } = await getSupabase().auth.updateUser({ email });
  if (error) throw new Error("Não consegui trocar o email. Verifique e tente de novo.");
}

export async function updatePassword(newPassword: string, currentPassword: string): Promise<void> {
  ensureReal();
  if (newPassword.length < 8) throw new Error("A nova senha precisa de ao menos 8 caracteres.");
  if (newPassword === currentPassword) throw new Error("A nova senha tem que ser diferente da atual.");
  await reauth(currentPassword);
  const { error } = await getSupabase().auth.updateUser({ password: newPassword });
  if (error) throw new Error("Não consegui trocar a senha. Tente de novo.");
}

// Allowlist deliberada: PNG/JPG/WEBP. Sem SVG (XSS via bucket publico) e sem GIF.
const AVATAR_EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};
const AVATAR_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

export async function uploadAvatar(file: File): Promise<string> {
  ensureReal();
  const ext = AVATAR_EXT[file.type];
  if (!ext) throw new Error("Use uma imagem PNG, JPG ou WEBP.");
  if (file.size > AVATAR_MAX_BYTES) throw new Error("Imagem muito grande (máx. 2 MB).");

  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre de novo.");

  // Extensao vem do MIME validado, NUNCA do file.name. Path fixo por usuario.
  const path = `${uid}/avatar.${ext}`;
  const { error: upErr } = await sb.storage.from("avatars").upload(path, file, {
    upsert: true,
    contentType: file.type,
    cacheControl: "3600",
  });
  if (upErr) throw new Error("Não consegui subir a foto. Tente de novo.");

  const { data: pub } = sb.storage.from("avatars").getPublicUrl(path);
  // cache-buster: mesmo path, forca o browser a buscar a imagem nova.
  const url = `${pub.publicUrl}?v=${Date.now()}`;
  const { error: metaErr } = await sb.auth.updateUser({ data: { avatar_url: url } });
  if (metaErr) throw new Error("A foto subiu, mas não consegui salvar no perfil. Tente de novo.");
  return url;
}

export async function removeAvatar(): Promise<void> {
  ensureReal();
  const sb = getSupabase();
  const { data } = await sb.auth.getUser();
  const uid = data.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre de novo.");
  // Remove os possiveis formatos guardados pra esse usuario.
  await sb.storage.from("avatars").remove(["png", "jpg", "webp"].map((e) => `${uid}/avatar.${e}`));
  const { error } = await sb.auth.updateUser({ data: { avatar_url: null } });
  if (error) throw new Error("Não consegui remover a foto. Tente de novo.");
}
