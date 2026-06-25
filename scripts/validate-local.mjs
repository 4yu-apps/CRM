// Valida a Fase 0 OFFLINE — Postgres embutido (pglite, WASM, sem docker).
// Aplica as 6 migrations num banco em memoria com stub do schema `auth` do
// Supabase, depois roda testes de catalogo + comportamento (maquina de
// estados, dedup, guarda LGPD, historico, RPC). Uso: node scripts/validate-local.mjs
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const migDir = join(root, 'supabase', 'migrations')

let fail = 0
const ok  = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const bad = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); fail++ }
const section = (m) => console.log(`\n\x1b[1m${m}\x1b[0m`)

// Stub do ambiente Supabase que o pglite nao tem (auth schema, roles).
// auth.uid() le um GUC de teso para podermos exercitar RLS.
const PREAMBLE = `
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
`

const db = new PGlite()

// helper: espera erro ao rodar fn; passa se o erro casar com /re/
const expectError = async (label, sql, re) => {
  try { await db.exec(sql); bad(`${label}: deveria ter falhado`) }
  catch (e) { re.test(e.message) ? ok(label) : bad(`${label}: erro inesperado -> ${e.message}`) }
}

const run = async () => {
  await db.exec(PREAMBLE)

  // ---- aplicar migrations em ordem ----
  section('Aplicando migrations')
  const files = readdirSync(migDir).filter(f => f.endsWith('.sql')).sort()
  for (const f of files) {
    // pg_trgm nao e empacotado pelo PGlite. Esta migration e validada no
    // Supabase real pelo db push; o restante do schema segue coberto offline.
    if (f === '20260625120500_receita_estabelecimento.sql') {
      ok(`${f} (pulada no PGlite: pg_trgm indisponivel)`)
      continue
    }
    try { await db.exec(readFileSync(join(migDir, f), 'utf8')); ok(f) }
    catch (e) { bad(`${f} -> ${e.message}`); throw e }
  }

  // ---- catalogo ----
  section('Catalogo')
  const one = async (sql, p) => (await db.query(sql, p)).rows
  const tables = ['leads', 'lead_field_provenance', 'lead_status_history', 'lead_status_transitions']
  const got = (await one(
    `select table_name from information_schema.tables where table_schema='public' and table_name = any($1)`,
    [tables])).map(r => r.table_name)
  for (const t of tables) got.includes(t) ? ok(`tabela ${t}`) : bad(`tabela ${t} AUSENTE`)

  const labels = (await one(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='lead_status'`
  )).map(r => r.enumlabel)
  labels.length === 15 ? ok(`enum lead_status (15 estados)`) : bad(`enum lead_status = ${labels.length}/15`)

  const [{ n }] = await one('select count(*)::int n from public.lead_status_transitions')
  n === 68 ? ok(`68 transicoes seedadas`) : bad(`transicoes = ${n}/68`)

  const react = await one(
    `select 1 from public.lead_status_transitions where from_status='descartado' and to_status='rascunho_pronto'`)
  react.length ? ok('reativar arquivado volta pra Novo (descartado -> rascunho_pronto)') : bad('transicao reativar AUSENTE')

  const fwd = await one(
    `select 1 from public.lead_status_transitions where from_status='aprovado' and to_status='reuniao'`)
  fwd.length ? ok('transicao forward do kanban (aprovado -> reuniao)') : bad('transicao forward AUSENTE')

  const archivedCol = await one(
    `select 1 from information_schema.columns where table_name='leads' and column_name='archived'`)
  archivedCol.length ? ok('coluna archived (acoes de lead)') : bad('coluna archived AUSENTE')

  // colunas de rascunho (Fase 3 · migration 7)
  const draftCols = (await one(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`,
    [["draft_msg1", "draft_msg2", "draft_model", "draft_generated_at"]],
  )).map(r => r.column_name)
  draftCols.length === 4 ? ok("colunas de rascunho (Fase 3)") : bad(`colunas de rascunho = ${draftCols.length}/4`)

  // B1 — service_target (enum + coluna) + ads_active
  const stLabels = (await one(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='service_target'`
  )).map(r => r.enumlabel)
  stLabels.length === 6 ? ok('enum service_target (6 alvos)') : bad(`enum service_target = ${stLabels.length}/6`)
  const b1Cols = (await one(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`, [["service_target", "ads_active"]]
  )).map(r => r.column_name)
  b1Cols.length === 2 ? ok('colunas B1 (service_target, ads_active)') : bad(`colunas B1 = ${b1Cols.length}/2`)

  // B8 — precificacao (enum deal_billing + 7 colunas)
  const dbLabels = (await one(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='deal_billing'`
  )).map(r => r.enumlabel)
  dbLabels.length === 2 ? ok('enum deal_billing (2 tipos)') : bad(`enum deal_billing = ${dbLabels.length}/2`)
  const b8 = ["notes", "suggested_value", "suggested_value_reason", "deal_value", "deal_billing", "deal_term_months", "deal_closed_at"]
  const b8Cols = (await one(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`, [b8]
  )).map(r => r.column_name)
  b8Cols.length === b8.length ? ok('colunas B8 (precificacao)') : bad(`colunas B8 = ${b8Cols.length}/${b8.length}`)

  // follow-up MVP: followup_at + followup_note
  const followupCols = (await one(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`, [["followup_at", "followup_note"]]
  )).map(r => r.column_name)
  followupCols.length === 2 ? ok('colunas follow-up (followup_at, followup_note)') : bad(`colunas follow-up = ${followupCols.length}/2`)

  const rls = await one(
    `select relname from pg_class where relnamespace='public'::regnamespace and relrowsecurity and relname=any($1)`,
    [tables])
  rls.length === 4 ? ok('RLS ligado nas 4 tabelas') : bad(`RLS em ${rls.length}/4`)

  // B2/B3/B4 — 3 tabelas novas (search_profile, scan_coverage, activity_log)
  const newTables = ['search_profile', 'scan_coverage', 'activity_log']
  const newTablesGot = (await one(
    `select table_name from information_schema.tables where table_schema='public' and table_name = any($1)`,
    [newTables])).map(r => r.table_name)
  for (const t of newTables) newTablesGot.includes(t) ? ok(`tabela ${t}`) : bad(`tabela ${t} AUSENTE`)

  // onboarding por profissao: search_profile.profession
  const profCol = await one(
    `select 1 from information_schema.columns where table_name='search_profile' and column_name='profession'`)
  profCol.length ? ok('coluna search_profile.profession (onboarding)') : bad('coluna profession AUSENTE')

  // enum activity_type (5 labels)
  const atLabels = (await one(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='activity_type'`
  )).map(r => r.enumlabel)
  atLabels.length === 5 ? ok('enum activity_type (5 valores)') : bad(`enum activity_type = ${atLabels.length}/5`)

  // coluna leads.name_addr_normalized (gerada)
  const nameAddrGen = await one(
    `select 1 from information_schema.columns where table_name='leads' and column_name='name_addr_normalized' and is_generated='ALWAYS'`)
  nameAddrGen.length ? ok('coluna leads.name_addr_normalized (gerada)') : bad('coluna leads.name_addr_normalized AUSENTE ou nao gerada')

  // indice leads_owner_name_addr_uniq
  const nameAddrIdx = await one(
    `select 1 from pg_indexes where tablename='leads' and indexname='leads_owner_name_addr_uniq'`)
  nameAddrIdx.length ? ok('indice leads_owner_name_addr_uniq') : bad('indice leads_owner_name_addr_uniq AUSENTE')

  // RLS nas 3 tabelas novas
  const newRls = await one(
    `select relname from pg_class where relnamespace='public'::regnamespace and relrowsecurity and relname=any($1)`,
    [newTables])
  newRls.length === 3 ? ok('RLS ligado nas 3 tabelas novas') : bad(`RLS em ${newRls.length}/3 tabelas novas`)

  // ---- comportamento: dedup / normalizacao / historico ----
  section('Comportamento — insert, normalizacao, historico')
  const U1 = '11111111-1111-1111-1111-111111111111'
  const U2 = '22222222-2222-2222-2222-222222222222'
  await db.exec(`insert into auth.users(id) values ('${U1}'),('${U2}')`)

  const ins = await one(
    `insert into public.leads (owner_id, business_name, cnpj, phone, status)
     values ($1, 'Pizzaria Teste', '11.222.333/0001-44', '(44) 99999-0000', 'bruto')
     returning id, cnpj_normalized, phone_normalized`, [U1])
  const leadId = ins[0].id
  ins[0].cnpj_normalized === '11222333000144' ? ok('cnpj_normalized so digitos') : bad(`cnpj_normalized = ${ins[0].cnpj_normalized}`)
  ins[0].phone_normalized === '44999990000' ? ok('phone_normalized so digitos') : bad(`phone_normalized = ${ins[0].phone_normalized}`)

  const h0 = await one(`select from_status, to_status from public.lead_status_history where lead_id=$1`, [leadId])
  h0.length === 1 && h0[0].from_status === null && h0[0].to_status === 'bruto'
    ? ok('historico inicial (null -> bruto) gravado por trigger') : bad('historico inicial faltando')

  // ---- comportamento: maquina de estados ----
  section('Comportamento — maquina de estados')
  await db.exec(`update public.leads set status='enriquecido' where id='${leadId}'`)
  const h1 = await one(`select count(*)::int c from public.lead_status_history where lead_id=$1`, [leadId])
  h1[0].c === 2 ? ok('transicao valida bruto->enriquecido + historico') : bad(`historico c=${h1[0].c}`)

  await expectError('transicao invalida enriquecido->enviado bloqueada',
    `update public.leads set status='enviado' where id='${leadId}'`, /invalida/i)

  // ---- comportamento: guarda LGPD ----
  section('Comportamento — guarda LGPD (opt-out)')
  await db.exec(`update public.leads set status='qualificado' where id='${leadId}'`)
  await db.exec(`update public.leads set opt_out=true where id='${leadId}'`)
  const optAt = await one(`select opt_out_at from public.leads where id='${leadId}'`)
  optAt[0].opt_out_at ? ok('opt_out_at carimbado por trigger') : bad('opt_out_at nao carimbado')
  await expectError('opt-out bloqueia qualificado->rascunho_pronto',
    `update public.leads set status='rascunho_pronto' where id='${leadId}'`, /opt-out|LGPD/i)

  // ---- comportamento: dedup ----
  section('Comportamento — dedup')
  await expectError('CNPJ duplicado do mesmo dono rejeitado',
    `insert into public.leads (owner_id, cnpj) values ('${U1}', '11222333000144')`, /duplicate|unique/i)
  // dono diferente, mesmo CNPJ: permitido
  try {
    await db.exec(`insert into public.leads (owner_id, cnpj) values ('${U2}', '11222333000144')`)
    ok('mesmo CNPJ permitido para outro dono')
  } catch (e) { bad(`outro dono deveria poder: ${e.message}`) }

  // ---- comportamento: RPC transition_lead ----
  section('Comportamento — RPC transition_lead')
  const L2 = (await one(
    `insert into public.leads (owner_id, business_name, status) values ($1,'Lead RPC','bruto') returning id`, [U1]
  ))[0].id
  await db.exec(`select public.transition_lead('${L2}','enriquecido','human','via rpc')`)
  const hr = await one(
    `select actor, note, from_status, to_status from public.lead_status_history
     where lead_id=$1 order by changed_at desc limit 1`, [L2])
  hr[0].actor === 'human' && hr[0].note === 'via rpc' && hr[0].to_status === 'enriquecido'
    ? ok('transition_lead grava ator=human + nota + historico') : bad(`rpc historico inesperado: ${JSON.stringify(hr[0])}`)

  // ---- comportamento: proveniencia idempotente ----
  section('Comportamento — proveniencia (upsert idempotente)')
  await db.exec(
    `insert into public.lead_field_provenance (lead_id, field_name, source, value)
     values ('${leadId}','phone','google_maps','(44) 99999-0000')`)
  await expectError('proveniencia duplicada (lead,campo,fonte) rejeitada',
    `insert into public.lead_field_provenance (lead_id, field_name, source, value)
     values ('${leadId}','phone','google_maps','outro')`, /duplicate|unique/i)

  // ---- RLS: isolamento por dono ----
  section('RLS — isolamento por dono (auth.uid)')
  await db.exec(`set role authenticated`)
  await db.exec(`select set_config('garimpo.test_uid', '${U1}', false)`)
  const seenByU1 = await one(`select count(*)::int c from public.leads`)
  await db.exec(`select set_config('garimpo.test_uid', '${U2}', false)`)
  const seenByU2 = await one(`select count(*)::int c from public.leads`)
  await db.exec(`reset role`)
  seenByU1[0].c >= 2 && seenByU2[0].c === 1
    ? ok(`dono U1 ve ${seenByU1[0].c} leads, U2 ve so ${seenByU2[0].c} (RLS isola)`)
    : bad(`RLS nao isolou: U1=${seenByU1[0].c} U2=${seenByU2[0].c}`)
}

run()
  .then(() => {
    console.log(fail ? `\n\x1b[31m${fail} falha(s).\x1b[0m` : '\n\x1b[32mFase 0 validada offline — schema correto e comportamento OK.\x1b[0m')
    process.exit(fail ? 1 : 0)
  })
  .catch(e => { console.error('\n\x1b[31merro fatal:\x1b[0m', e.message); process.exit(1) })
