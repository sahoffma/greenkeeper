/**
 * Static validation for migration 20250730_area_cover_image.sql.
 *
 *   node scripts/verify-area-cover-image-migration.mjs
 */
import { readFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(__dirname, '../supabase/migrations/20250730_area_cover_image.sql')
const areasBasePath = join(__dirname, '../supabase/migrations/20250725_onboarding_care_groups.sql')

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
const areasBaseSql = existsSync(areasBasePath) ? readFileSync(areasBasePath, 'utf8') : ''

log('ACI-0 migration file', true, migrationPath)

includesAll('ACI-1 optional cover column on areas', sql, [
  'alter table public.areas',
  'add column if not exists cover_image_path text',
])

includesAll('ACI-2 path validation helper', sql, [
  'create or replace function public.validate_area_cover_path(',
  "if p_cover_image_path is null or p_cover_image_path = '' then",
  'return false',
  '/cover-[0-9a-f-]+\\.jpg$',
])

includesAll('ACI-3 set cover RPC', sql, [
  'create or replace function public.set_area_cover_image(',
  'security definer',
  'set search_path = public',
  'auth.uid()',
  'user_owns_area(p_area_id)',
  'validate_area_cover_path',
  'INVALID_COVER_PATH',
  'old_cover_image_path',
])

includesAll('ACI-4 remove cover RPC', sql, [
  'create or replace function public.remove_area_cover_image(p_area_id uuid)',
  'cover_image_path = null',
  'old_cover_image_path',
])

includesAll('ACI-5 area detail update RPC', sql, [
  'create or replace function public.update_area_details(',
  'FOREIGN_OR_MISSING_AREA',
  'EMPTY_AREA_NAME',
  'INVALID_AREA_SIZE',
])

includesAll('ACI-6 grants', sql, [
  'revoke all on function public.set_area_cover_image(uuid, text) from public',
  'grant execute on function public.set_area_cover_image(uuid, text) to authenticated',
  'revoke all on function public.remove_area_cover_image(uuid) from public',
  'grant execute on function public.remove_area_cover_image(uuid) to authenticated',
  'revoke all on function public.update_area_details(uuid, text, numeric) from public',
  'grant execute on function public.update_area_details(uuid, text, numeric) to authenticated',
])

includesAll('ACI-7 private storage bucket and policies', sql, [
  "insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)",
  "'lawn-images'",
  'lawn_images_select_own',
  'lawn_images_insert_own',
  'lawn_images_delete_own',
  'auth.uid()',
])

excludesAll('ACI-8 no parallel area table', sql, [
  'create table if not exists public.areas',
  'create table public.areas',
])

excludesAll('ACI-9 no backfills', sql, [
  'update public.areas set cover_image_path',
  'delete from public.areas',
])

excludesAll('ACI-10 no secrets', sql, [
  'SUPABASE_SERVICE_ROLE_KEY',
  'postgres://',
  'postgresql://',
])

includesAll('ACI-11 ownership checks use user_owns_area', sql, [
  'user_owns_area(p_area_id)',
])

includesAll('ACI-12 project assumes user_owns_area helper', areasBaseSql, [
  'user_owns_area(area_id)',
])

const failed = results.filter((entry) => !entry.ok).length
console.log(`\n${results.length - failed}/${results.length} checks passed`)

if (failed > 0) {
  process.exit(1)
}
