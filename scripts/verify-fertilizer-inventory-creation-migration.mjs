/**
 * GA-014 Phase 7B — Static schema validation for inventory creation migration.
 *
 *   node scripts/verify-fertilizer-inventory-creation-migration.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250806_fertilizer_inventory_creation_core.sql',
)
const coreMigrationPath = join(
  __dirname,
  '../supabase/migrations/20250805_fertilizer_inventory_core.sql',
)
const legacyCaptureMigrationPath = join(
  __dirname,
  '../supabase/migrations/20250802_save_fertilizer_capture_replay_product_profile.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const coreSql = readFileSync(coreMigrationPath, 'utf8')
const legacyCaptureSql = readFileSync(legacyCaptureMigrationPath, 'utf8')
const results = []

function log(section, ok, detail) {
  results.push({ section, ok, detail })
  console.log(`${ok ? '✅' : '❌'} [${section}] ${detail}`)
}

function includesAll(section, source, requiredSnippets) {
  const missing = requiredSnippets.filter((snippet) => !source.includes(snippet))
  log(
    section,
    missing.length === 0,
    missing.length === 0 ? 'present' : `missing: ${missing.join(', ')}`,
  )
}

function excludesAll(section, source, forbiddenSnippets) {
  const present = forbiddenSnippets.filter((snippet) => source.includes(snippet))
  log(
    section,
    present.length === 0,
    present.length === 0 ? 'absent' : `must not appear: ${present.join(', ')}`,
  )
}

includesAll('IC7B-1 migration file exists', sql, [
  'fertilizer_inventory_creation_receipts',
])

includesAll('IC7B-2 receipt table columns', sql, [
  'id uuid primary key',
  'access_kind text not null',
  'user_id uuid null',
  'session_access_hash text null',
  'idempotency_key text not null',
  'payload_fingerprint text not null',
  'saved_product_profile_id uuid not null',
  'creation_reason text not null',
  'source_event_ref text null',
  'result_jsonb jsonb null',
  'created_at timestamptz not null',
  'completed_at timestamptz null',
])

excludesAll('IC7B-3 receipt has no balance fields', sql, [
  'current_quantity',
  'remaining_amount',
  'balance numeric',
  'balance_value',
])

includesAll('IC7B-4 scoped unique indexes', sql, [
  'fertilizer_inventory_creation_receipts_auth_idempotency_idx',
  'fertilizer_inventory_creation_receipts_session_idempotency_idx',
  'where access_kind = \'authenticated_user\'',
  'where access_kind = \'session\'',
])

includesAll('IC7B-5 access constraint', sql, [
  'fertilizer_inventory_creation_receipts_access_context_check',
])

includesAll('IC7B-6 creation reason constraint', sql, [
  'fertilizer_inventory_creation_receipts_creation_reason_check',
  "'initial_stock'",
  "'purchase'",
  "'gift_received'",
])

includesAll('IC7B-7 creation RPC exists', sql, [
  'create_fertilizer_inventory_core_from_confirmed_packages',
])

excludesAll('IC7B-8 RPC accepts no client fingerprint param', sql, [
  'p_payload_fingerprint',
])

includesAll('IC7B-9 server-side SHA-256 fingerprint', sql, [
  'pgcrypto',
  '_inventory_creation_compute_fingerprint',
  "digest(",
  "'sha256'",
])

includesAll('IC7B-10 product profile validation', sql, [
  "v_profile.profile_status <> 'saved'",
  "v_profile.source <> 'enrichment'",
  'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_FOUND',
  'INVENTORY_CREATION_PRODUCT_PROFILE_NOT_READY',
])

includesAll('IC7B-11 access context validation', sql, [
  'INVENTORY_CREATION_ACCESS_DENIED',
  'auth.uid()',
])

includesAll('IC7B-12 base unit validation', sql, [
  "v_profile.product_form = 'granular'",
  "v_base_unit := 'kg'",
  "v_profile.product_form = 'liquid'",
  "v_base_unit := 'ml'",
  'INVENTORY_CREATION_UNIT_MISMATCH',
])

includesAll('IC7B-13 package count 1 to 20', sql, [
  'INVENTORY_CREATION_PACKAGE_LIST_EMPTY',
  'INVENTORY_CREATION_PACKAGE_COUNT_EXCEEDED',
  'v_package_count > 20',
])

includesAll('IC7B-14 quantity and precision validation', sql, [
  'INVENTORY_CREATION_PACKAGE_SIZE_INVALID',
  'INVENTORY_CREATION_INITIAL_QUANTITY_INVALID',
  'INVENTORY_CREATION_INITIAL_QUANTITY_EXCEEDS_PACKAGE_SIZE',
  'round(v_package_size, 4)',
])

includesAll('IC7B-15 rejects inventory_correction implicitly', sql, [
  'INVENTORY_CREATION_REASON_INVALID',
])

log(
  'IC7B-16 inventory_correction not allowed as creation reason',
  !sql.includes("'inventory_correction'") ||
    !sql.match(/creation_reason.*inventory_correction/s),
  "creation_reason check excludes inventory_correction",
)

includesAll('IC7B-17 one item per package', sql, [
  'insert into public.fertilizer_containers',
])

includesAll('IC7B-18 one initial movement per item', sql, [
  'insert into public.fertilizer_stock_movements',
  '_inventory_creation_movement_idempotency_key',
  'inventory-create:',
])

excludesAll('IC7B-18b no truncated request key in movement idempotency', sql, [
  'left(v_idempotency_key, 240)',
  ':seq:',
])

includesAll('IC7B-19 request idempotency handling', sql, [
  'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT',
  'INVENTORY_CREATION_IDEMPOTENCY_INVALID',
  'payload_fingerprint',
  'result_jsonb',
])

includesAll('IC7B-20 payload conflict detection', sql, [
  'v_receipt.payload_fingerprint <> v_fingerprint',
  'INVENTORY_CREATION_IDEMPOTENCY_CONFLICT',
])

includesAll('IC7B-21 single function transaction rollback', sql, [
  'language plpgsql',
  'exception',
  'INVENTORY_CREATION_FAILED',
])

includesAll('IC7B-22 deterministic response', sql, [
  'operation_id',
  'idempotency_key',
  'sequence_index',
  'initial_movement',
])

excludesAll('IC7B-23 no new inventory tables', sql, [
  'create table public.fertilizer_inventory_items',
  'create table public.fertilizer_inventory_movements',
])

excludesAll('IC7B-24 no backfill', sql, [
  'update public.fertilizer_containers',
  'insert into public.product_profiles',
])

log(
  'IC7B-25 legacy capture RPC untouched in this migration',
  !sql.includes('create or replace function public.save_fertilizer_capture'),
  'absent',
)

log(
  'IC7B-26 product profile save RPC untouched in this migration',
  !sql.includes('save_fertilizer_product_profile'),
  'absent',
)

includesAll('IC7B-27 secure search_path', sql, [
  'security definer',
  'set search_path = public',
])

includesAll('IC7B-28 grants', sql, [
  'grant execute on function public.create_fertilizer_inventory_core_from_confirmed_packages',
  'to authenticated, service_role',
])

includesAll('IC7B-29 direct receipt writes restricted', sql, [
  'revoke all on public.fertilizer_inventory_creation_receipts',
  'enable row level security',
])

includesAll('IC7B-30 parallel creation guard', sql, [
  'pg_advisory_xact_lock',
  '_inventory_creation_advisory_lock_key',
  'accessKind',
  'scopeId',
  'idempotencyKey',
  '<< 56',
])

excludesAll('IC7B-30b no simple hashtext creation lock', sql, [
  'hashtext(',
])

includesAll('IC7B-30c advisory lock comment and unique index boundary', sql, [
  'Advisory lock serializes parallel creation requests',
  'Scoped unique indexes remain the final correctness boundary',
  'fertilizer_inventory_creation_receipts_auth_idempotency_idx',
  'fertilizer_inventory_creation_receipts_session_idempotency_idx',
])

excludesAll('IC7B-31 no stored balance in migration', sql, [
  'add column if not exists balance',
  'current_quantity',
])

log(
  'IC7B-32 published 20250805 migration unchanged on disk',
  coreSql.includes('append_fertilizer_inventory_core_movement'),
  coreSql.includes('append_fertilizer_inventory_core_movement')
    ? '20250805 still contains append RPC only'
    : '20250805 missing expected content',
)

log(
  'IC7B-33 legacy capture still defined elsewhere',
  legacyCaptureSql.includes('create or replace function public.save_fertilizer_capture'),
  legacyCaptureSql.includes('create or replace function public.save_fertilizer_capture')
    ? 'present in 20250802 migration'
    : 'missing from legacy migration file',
)

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
