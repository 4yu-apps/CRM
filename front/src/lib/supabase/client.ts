// Cliente Supabase para o browser (usa a anon key; RLS protege).
// So e instanciado quando o modo supabase esta ativo.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase env ausente (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY).");
  }
  _client = createClient(url, key);
  return _client;
}
