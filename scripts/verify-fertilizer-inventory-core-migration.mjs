/**
 * GA-014 Phase 7a — Static schema validation for inventory core migration.
 *
 *   node scripts/verify-fertilizer-inventory-core-migration.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250805_fertilizer_inventory_core.sql',
)
const legacyCaptureMigrationPath = join(
  __dirname,
  '../supabase/migrations/20250802_save_fertilizer_capture_replay_product_profile.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const legacyCaptureSql = readFileSync(legacyCaptureMigrationPath, 'utf8')
const results = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function includesAll(section, requiredSnippets) {
  const missing = requiredSnippets.filter((snippet) => !sql.includes(snippet))
  log(
    section,
    missing.length === 0,
    missing.length === 0 ? 'present' : `missing: ${missing.join(', ')}`,
  )
}

function excludesAll(section, forbiddenSnippets) {
  const present = forbiddenSnippets.filter((snippet) => sql.includes(snippet))
  log(
    section,
    present.length === 0,
    present.length === 0 ? 'absent' : `must not appear: ${present.join(', ')}`,
  )
}

includesAll('IC-1 container core columns', [
  'saved_product_profile_id',
  'access_kind',
  'session_access_hash',
  'base_unit',
])

includesAll('IC-2 movement core columns', [
  'inventory_idempotency_key',
  'source_event_ref',
  'movement_at',
])

includesAll('IC-3 product_profiles FK', [
  'saved_product_profile_id uuid references public.product_profiles',
])

includesAll('IC-4 saved-only validation', [
  'validate_fertilizer_container_saved_product_profile',
  "pp.profile_status = 'saved'",
  "pp.source = 'enrichment'",
  'INVALID_SAVED_PRODUCT_PROFILE_REFERENCE',
])

includesAll('IC-5 access scope constraints', [
  'fertilizer_containers_access_context_check',
  'fertilizer_stock_movements_access_context_check',
  "'authenticated_user'",
  "'session'",
])

includesAll('IC-6 core product binding constraint', [
  'fertilizer_containers_product_binding_check',
  'saved_product_profile_id is not null',
])

excludesAll('IC-7 no stored balance columns', [
  'current_quantity',
  'remaining_amount',
  'add column if not exists balance',
])

includesAll('IC-8 movement immutability trigger', [
  'prevent_fertilizer_stock_movement_mutation',
  'prevent_fertilizer_stock_movement_update',
  'prevent_fertilizer_stock_movement_delete',
  'INVENTORY_MOVEMENT_IMMUTABLE',
])

includesAll('IC-9 numeric(18,4) precision', [
  'quantity_delta type numeric(18, 4)',
  'package_size_value type numeric(18, 4)',
])

includesAll('IC-10 idempotency indexes', [
  'fertilizer_stock_movements_auth_inventory_idempotency_idx',
  'fertilizer_stock_movements_session_inventory_idempotency_idx',
])

includesAll('IC-16 atomic append movement RPC', [
  'append_fertilizer_inventory_core_movement',
  'for update',
  'INVENTORY_ITEM_NOT_FOUND',
  'INVENTORY_ACCESS_DENIED',
  'INVENTORY_UNIT_MISMATCH',
  'INVENTORY_QUANTITY_INVALID',
  'INVENTORY_NEGATIVE_BALANCE',
  'INVENTORY_IDEMPOTENCY_CONFLICT',
  'security definer',
  'set search_path = public',
  'grant execute on function public.append_fertilizer_inventory_core_movement',
])

includesAll('IC-11 saved product profile indexes', [
  'fertilizer_containers_saved_product_profile_idx',
  'fertilizer_containers_auth_saved_profile_idx',
  'fertilizer_containers_session_saved_profile_idx',
])

excludesAll('IC-12 no new inventory tables', [
  'create table public.fertilizer_inventory_items',
  'create table public.fertilizer_inventory_movements',
  'create table public.fertilizer_inventory',
])

excludesAll('IC-13 legacy capture RPC untouched in migration', [
  'create or replace function public.save_fertilizer_capture',
])

log(
  'IC-14 legacy capture RPC still defined elsewhere',
  legacyCaptureSql.includes('create or replace function public.save_fertilizer_capture'),
  legacyCaptureSql.includes('create or replace function public.save_fertilizer_capture')
    ? 'present in 20250802 migration'
    : 'missing from legacy migration file',
)

excludesAll('IC-15 no unique constraint on saved_product_profile_id alone', [
  'unique (saved_product_profile_id)',
  'unique(saved_product_profile_id)',
])

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
