// Verificacao de catalogo da Fase 0. Nao precisa de usuario/auth —
// so consulta o schema. Uso: node scripts/verify.mjs  (le .env)
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import pg from 'pg'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

// carregar .env simples (KEY=VALUE)
try {
  for (const line of readFileSync(join(root, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
} catch { /* sem .env, usa ambiente */ }

const url = process.env.SUPABASE_DB_URL
if (!url) { console.error('defina SUPABASE_DB_URL no .env'); process.exit(1) }

const client = new pg.Client({ connectionString: url })
let fail = 0
const ok  = (m) => console.log(`  \x1b[32m✓\x1b[0m ${m}`)
const bad = (m) => { console.log(`  \x1b[31m✗ ${m}\x1b[0m`); fail++ }
const q = (sql, p) => client.query(sql, p).then(r => r.rows)

const checks = async () => {
  // 1. tabelas
  const tables = ['leads', 'lead_field_provenance', 'lead_status_history', 'lead_status_transitions']
  const got = (await q(
    `select table_name from information_schema.tables
     where table_schema='public' and table_name = any($1)`, [tables]
  )).map(r => r.table_name)
  for (const t of tables) got.includes(t) ? ok(`tabela ${t}`) : bad(`tabela ${t} AUSENTE`)

  // 2. enum lead_status (15 estados)
  const labels = (await q(
    `select e.enumlabel from pg_enum e
     join pg_type t on t.oid=e.enumtypid where t.typname='lead_status'`
  )).map(r => r.enumlabel)
  labels.length === 15 ? ok(`enum lead_status (${labels.length} estados)`)
    : bad(`enum lead_status tem ${labels.length}, esperado 15`)

  // 3. RLS ligado nas 4 tabelas
  const rls = await q(
    `select relname from pg_class
     where relnamespace='public'::regnamespace and relrowsecurity and relname=any($1)`, [tables])
  rls.length === 4 ? ok('RLS ligado nas 4 tabelas')
    : bad(`RLS ligado em ${rls.length}/4 tabelas`)

  // 4. transicoes seedadas
  const [{ n }] = await q('select count(*)::int n from public.lead_status_transitions')
  n === 25 ? ok(`maquina de estados: ${n} transicoes`)
    : bad(`transicoes = ${n}, esperado 25`)

  // 5. RPC transition_lead
  const fn = await q(`select 1 from pg_proc where proname='transition_lead'`)
  fn.length ? ok('rpc transition_lead') : bad('rpc transition_lead AUSENTE')

  // 6. colunas geradas de dedup
  const gen = (await q(
    `select column_name from information_schema.columns
     where table_name='leads' and is_generated='ALWAYS'`
  )).map(r => r.column_name)
  ;['cnpj_normalized', 'phone_normalized'].forEach(c =>
    gen.includes(c) ? ok(`coluna gerada ${c}`) : bad(`coluna gerada ${c} AUSENTE`))

  // 7. indices unicos de dedup
  const idx = (await q(
    `select indexname from pg_indexes where tablename='leads' and indexname like '%uniq'`
  )).map(r => r.indexname)
  idx.length >= 2 ? ok(`indices de dedup (${idx.length})`) : bad(`dedup indices = ${idx.length}`)

  // 8. B1 — service_target (enum + coluna) + ads_active
  const st = (await q(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='service_target'`
  )).map(r => r.enumlabel)
  st.length === 4 ? ok(`enum service_target (${st.length} alvos)`) : bad(`enum service_target = ${st.length}/4`)
  const b1 = (await q(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`, [['service_target', 'ads_active']]
  )).map(r => r.column_name)
  b1.length === 2 ? ok('colunas B1 (service_target, ads_active)') : bad(`colunas B1 = ${b1.length}/2`)

  // 9. B8 — precificacao (enum deal_billing + 7 colunas)
  const dbil = (await q(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='deal_billing'`
  )).map(r => r.enumlabel)
  dbil.length === 2 ? ok(`enum deal_billing (${dbil.length} tipos)`) : bad(`enum deal_billing = ${dbil.length}/2`)
  const b8names = ['notes', 'suggested_value', 'suggested_value_reason', 'deal_value', 'deal_billing', 'deal_term_months', 'deal_closed_at']
  const b8 = (await q(
    `select column_name from information_schema.columns
     where table_name='leads' and column_name = any($1)`, [b8names]
  )).map(r => r.column_name)
  b8.length === b8names.length ? ok(`colunas B8 (${b8.length})`) : bad(`colunas B8 = ${b8.length}/${b8names.length}`)

  // 10. B2/B3/B4 — 3 tabelas novas + enum activity_type + coluna gerada name_addr_normalized + indice
  const newTables = ['search_profile', 'scan_coverage', 'activity_log']
  const newTablesGot = (await q(
    `select table_name from information_schema.tables where table_schema='public' and table_name = any($1)`,
    [newTables])).map(r => r.table_name)
  for (const t of newTables) newTablesGot.includes(t) ? ok(`tabela ${t}`) : bad(`tabela ${t} AUSENTE`)

  const atLabels = (await q(
    `select e.enumlabel from pg_enum e join pg_type t on t.oid=e.enumtypid where t.typname='activity_type'`
  )).map(r => r.enumlabel)
  atLabels.length === 5 ? ok(`enum activity_type (${atLabels.length} valores)`) : bad(`enum activity_type = ${atLabels.length}/5`)

  const nameAddrGen = await q(
    `select 1 from information_schema.columns where table_name='leads' and column_name='name_addr_normalized' and is_generated='ALWAYS'`)
  nameAddrGen.length ? ok('coluna leads.name_addr_normalized (gerada)') : bad('coluna leads.name_addr_normalized AUSENTE ou nao gerada')

  const nameAddrIdx = await q(
    `select 1 from pg_indexes where tablename='leads' and indexname='leads_owner_name_addr_uniq'`)
  nameAddrIdx.length ? ok('indice leads_owner_name_addr_uniq') : bad('indice leads_owner_name_addr_uniq AUSENTE')

  const newRls = await q(
    `select relname from pg_class where relnamespace='public'::regnamespace and relrowsecurity and relname=any($1)`,
    [newTables])
  newRls.length === 3 ? ok('RLS ligado nas 3 tabelas novas') : bad(`RLS em ${newRls.length}/3 tabelas novas`)
}

client.connect()
  .then(checks)
  .then(() => {
    console.log(fail ? `\n\x1b[31m${fail} falha(s).\x1b[0m` : '\n\x1b[32mFase 0 OK — fundacao no ar.\x1b[0m')
    return client.end()
  })
  .then(() => process.exit(fail ? 1 : 0))
  .catch(e => { console.error('\nerro:', e.message); client.end(); process.exit(1) })
