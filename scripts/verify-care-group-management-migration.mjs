/**
 * Static validation for migration 20250726_care_group_management.sql.
 *
 *   node scripts/verify-care-group-management-migration.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(__dirname, '../supabase/migrations/20250726_care_group_management.sql')
const followUpPath = join(
  __dirname,
  '../supabase/migrations/20250729_onboarding_custom_care_groups.sql',
)
const basePath = join(__dirname, '../supabase/migrations/20250725_onboarding_care_groups.sql')

const results = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function includesAll(section, haystack, requiredSnippets) {
  const missing = requiredSnippets.filter((snippet) => !haystack.includes(snippet))
  log(
    section,
    missing.length === 0,
    missing.length === 0 ? 'present' : `missing: ${missing.join(', ')}`,
  )
}

function excludesAll(section, haystack, forbiddenSnippets) {
  const present = forbiddenSnippets.filter((snippet) => haystack.includes(snippet))
  log(
    section,
    present.length === 0,
    present.length === 0 ? 'absent' : `must not appear: ${present.join(', ')}`,
  )
}

if (!existsSync(migrationPath)) {
  console.error(`Migration not found: ${migrationPath}`)
  process.exit(1)
}

const sql = readFileSync(migrationPath, 'utf8')
const followUpSql = existsSync(followUpPath) ? readFileSync(followUpPath, 'utf8') : ''
const baseSql = existsSync(basePath) ? readFileSync(basePath, 'utf8') : ''

log('CGM-0 migration file', true, migrationPath)

includesAll('CGM-1 prune helper', sql, [
  'create or replace function public.prune_care_groups(p_user_id uuid)',
  'security definer',
  'set search_path = public',
])

includesAll('CGM-2 membership prune trigger', sql, [
  'create or replace function public.prune_care_groups_after_membership_change()',
  'create trigger care_group_areas_prune',
  'after delete on public.care_group_areas',
])

includesAll('CGM-3 connect RPC', sql, [
  'create or replace function public.connect_areas_care_group(p_area_ids uuid[])',
  'auth.uid()',
  'MIN_TWO_AREAS_REQUIRED',
  'AREA_ALREADY_GROUPED',
  'insert into public.care_groups',
  'insert into public.care_group_areas',
  'perform public.prune_care_groups(v_user_id)',
])

includesAll('CGM-4 disconnect RPC', sql, [
  'create or replace function public.disconnect_area_from_care_group(p_area_id uuid)',
  'user_owns_area(p_area_id)',
  'delete from public.care_group_areas cga',
])

includesAll('CGM-5 dissolve RPC', sql, [
  'create or replace function public.dissolve_care_group(p_group_id uuid)',
  'user_owns_care_group(p_group_id)',
  'delete from public.care_group_areas',
  'delete from public.care_groups',
])

includesAll('CGM-6 grants', sql, [
  'revoke all on function public.prune_care_groups(uuid) from public',
  'grant execute on function public.prune_care_groups(uuid) to authenticated',
  'revoke all on function public.connect_areas_care_group(uuid[]) from public',
  'grant execute on function public.connect_areas_care_group(uuid[]) to authenticated',
  'revoke all on function public.disconnect_area_from_care_group(uuid) from public',
  'grant execute on function public.disconnect_area_from_care_group(uuid) to authenticated',
  'revoke all on function public.dissolve_care_group(uuid) from public',
  'grant execute on function public.dissolve_care_group(uuid) to authenticated',
])

includesAll('CGM-7 onboarding interim complete_onboarding', sql, [
  'create or replace function public.complete_onboarding(payload jsonb)',
  "v_care_mode not in ('single', 'together', 'separate')",
  "v_care_mode = 'together'",
  "'separate'",
])

includesAll('CGM-8 legacy singleton backfill', sql, [
  'delete from public.care_groups cg',
  ') < 2',
])

excludesAll('CGM-9 no duplicate care group tables', sql, [
  'create table if not exists public.care_groups',
  'create table public.care_groups',
  'create table if not exists public.care_group_areas',
  'create table public.care_group_areas',
])

excludesAll('CGM-10 no areas table rewrite', sql, [
  'alter table public.areas',
  'create table public.areas',
])

includesAll('CGM-11 assumes base helpers from 20250725', baseSql, [
  'user_owns_care_group',
  'user_owns_area',
  'create table if not exists public.care_groups',
  'care_group_areas_area_id_unique unique (area_id)',
])

if (followUpSql) {
  includesAll('CGM-12 follow-up replaces complete_onboarding', followUpSql, [
    'create or replace function public.complete_onboarding(payload jsonb)',
    "'custom'",
    'INVALID_CARE_GROUPS',
  ])

  log(
    'CGM-13 follow-up depends on care group RPCs from 20250726',
    followUpSql.includes('insert into public.care_groups') &&
      followUpSql.includes('insert into public.care_group_areas'),
    'custom onboarding uses existing care_groups tables',
  )
} else {
  log('CGM-12 follow-up migration file', false, '20250729 not found locally')
}

const failed = results.filter((entry) => !entry.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)

if (failed > 0) {
  process.exit(1)
}
