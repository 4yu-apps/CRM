// Schema real, num Postgres embutido (pglite, WASM, sem docker).
//
// Extraido de validate-local.mjs pra ter UM lugar que sabe aplicar as
// migrations offline. Quem precisa da verdade do schema (o validador da Fase 0 e
// os testes do front) pergunta pro Postgres em vez de tentar ler o SQL com
// expressao regular. Ja tentamos o regex: ele ignorou a migration que insere
// transicoes por cross join de arrays em vez de VALUES, e acusou 22 divergencias
// que nao existiam.
import { PGlite } from "@electric-sql/pglite";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const MIGRATIONS_DIR = join(ROOT, "supabase", "migrations");

// Migrations que o PGlite nao consegue aplicar. Ficam cobertas pelo db push no
// Supabase real; o resto do schema segue coberto offline.
export const SKIP = new Set([
  // pg_trgm nao e empacotado pelo PGlite
  "20260625120500_receita_estabelecimento.sql",
]);

// Stub do ambiente Supabase que o pglite nao tem (schema auth, storage, roles).
// auth.uid() le um GUC de teste, pra dar pra exercitar RLS.
export const PREAMBLE = `
  create schema if not exists auth;
  create schema if not exists storage;
  create table if not exists auth.users (
    id uuid primary key default gen_random_uuid(),
    email text
  );
  create or replace function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('garimpo.test_uid', true), '')::uuid $$;
  create or replace function auth.role() returns text language sql stable as
    $$ select coalesce(nullif(current_setting('garimpo.test_role', true), ''), 'authenticated') $$;
  create table if not exists storage.buckets (
    id text primary key,
    name text not null,
    public boolean not null default false,
    file_size_limit bigint
  );
  create table if not exists storage.objects (
    id uuid primary key default gen_random_uuid(),
    bucket_id text references storage.buckets(id),
    name text not null
  );
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(name text) returns text[]
    language sql immutable as
    $$ select string_to_array(trim(both '/' from name), '/') $$;
  do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
  do $$ begin create role anon;          exception when duplicate_object then null; end $$;
  do $$ begin create role service_role;  exception when duplicate_object then null; end $$;
`;

export function migrationFiles() {
  return readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
}

/**
 * Sobe um Postgres em memoria e aplica todas as migrations, em ordem.
 * `onFile(nome, erro)` avisa arquivo a arquivo (o validador usa pra imprimir).
 * Lanca no primeiro arquivo que nao aplicar.
 */
export async function applyMigrations(onFile = () => {}) {
  const db = new PGlite();
  await db.exec(PREAMBLE);
  for (const f of migrationFiles()) {
    if (SKIP.has(f)) {
      onFile(f, null, true);
      continue;
    }
    try {
      await db.exec(readFileSync(join(MIGRATIONS_DIR, f), "utf8"));
      onFile(f, null, false);
    } catch (e) {
      onFile(f, e, false);
      throw e;
    }
  }
  return db;
}
