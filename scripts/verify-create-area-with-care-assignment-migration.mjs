/**
 * Static validation for migration 20250728_create_area_with_care_assignment.sql.
 *
 *   node scripts/verify-create-area-with-care-assignment-migration.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250728_create_area_with_care_assignment.sql',
)
const basePath = join(__dirname, '../supabase/migrations/20250725_onboarding_care_groups.sql')
const managementPath = join(
  __dirname,
  '../supabase/migrations/20250726_care_group_management.sql',
)

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
const baseSql = existsSync(basePath) ? readFileSync(basePath, 'utf8') : ''
const managementSql = existsSync(managementPath) ? readFileSync(managementPath, 'utf8') : ''

log('CAWA-0 migration file', true, migrationPath)

includesAll('CAWA-1 RPC definition', sql, [
  'create or replace function public.create_area_with_care_assignment(',
  'p_name text',
  'p_size_sqm numeric(10, 2) default null',
  'p_join_care_group_id uuid default null',
  'p_join_area_id uuid default null',
  'returns jsonb',
])

includesAll('CAWA-2 security boundary', sql, [
  'security definer',
  'set search_path = public',
  'auth.uid()',
  'NOT_AUTHENTICATED',
])

includesAll('CAWA-3 name validation', sql, [
  "trim(both from coalesce(p_name, ''))",
  'EMPTY_AREA_NAME',
])

includesAll('CAWA-4 size validation', sql, [
  'p_size_sqm is not null and p_size_sqm <= 0',
  'INVALID_AREA_SIZE',
])

includesAll('CAWA-5 mutual exclusion of care targets', sql, [
  'p_join_care_group_id is not null and p_join_area_id is not null',
  'INVALID_CARE_TARGET',
])

includesAll('CAWA-6 existing group ownership and validity', sql, [
  'user_owns_care_group(p_join_care_group_id)',
  'FOREIGN_OR_MISSING_GROUP',
  'v_group_member_count < 2',
])

includesAll('CAWA-7 pair area ownership and grouping guard', sql, [
  'user_owns_area(p_join_area_id)',
  'FOREIGN_OR_MISSING_AREA',
  'AREA_ALREADY_GROUPED',
])

includesAll('CAWA-8 separate area without assignment', sql, [
  'insert into public.areas (user_id, name, size_sqm, sort_order)',
  'if p_join_care_group_id is not null then',
  'elsif p_join_area_id is not null then',
])

includesAll('CAWA-9 join existing group', sql, [
  'insert into public.care_group_areas (care_group_id, area_id)',
  'values (p_join_care_group_id, v_area_id)',
])

includesAll('CAWA-10 pair creates two-member group', sql, [
  "insert into public.care_groups (user_id, name, sort_order)",
  "values (v_user_id, 'Gemeinsam betrachtet', 0)",
  'values',
  '(v_group_id, p_join_area_id)',
  '(v_group_id, v_area_id)',
])

includesAll('CAWA-11 atomic response payload', sql, [
  "jsonb_build_object(",
  "'id', v_area_id",
  "'name', v_name",
  "'size_sqm', p_size_sqm",
])

includesAll('CAWA-12 grants', sql, [
  'revoke all on function public.create_area_with_care_assignment(text, numeric, uuid, uuid) from public',
  'grant execute on function public.create_area_with_care_assignment(text, numeric, uuid, uuid) to authenticated',
])

excludesAll('CAWA-13 no new tables or area rewrite', sql, [
  'create table if not exists public.areas',
  'create table public.areas',
  'alter table public.areas',
  'create table if not exists public.care_groups',
  'create table public.care_groups',
])

excludesAll('CAWA-14 no backfills', sql, [
  'update public.areas',
  'delete from public.areas',
  'update public.care_groups',
  'delete from public.care_groups',
])

excludesAll('CAWA-15 no secrets', sql, [
  'SUPABASE_SERVICE_ROLE_KEY',
  'postgres://',
  'postgresql://',
])

includesAll('CAWA-16 assumes base helpers from 20250725', baseSql, [
  'user_owns_care_group',
  'user_owns_area',
  'care_group_areas_area_id_unique unique (area_id)',
])

includesAll('CAWA-17 published care group management remains separate', managementSql, [
  'create or replace function public.connect_areas_care_group',
  'create or replace function public.disconnect_area_from_care_group',
  'create or replace function public.dissolve_care_group',
])

const failed = results.filter((entry) => !entry.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)

if (failed > 0) {
  process.exit(1)
}
