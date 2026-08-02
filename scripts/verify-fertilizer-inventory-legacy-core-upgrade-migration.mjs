/**
 * GA-014 Phase 7c — Static schema validation for legacy inventory-core upgrade migration.
 *
 *   node scripts/verify-fertilizer-inventory-legacy-core-upgrade-migration.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsDir = join(__dirname, '../supabase/migrations')
const migrationPath = join(
  migrationsDir,
  '20250807_fertilizer_inventory_legacy_core_upgrade.sql',
)
const coreMigrationPath = join(
  migrationsDir,
  '20250805_fertilizer_inventory_core.sql',
)
const creationMigrationPath = join(
  migrationsDir,
  '20250806_fertilizer_inventory_creation_core.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const coreSql = readFileSync(coreMigrationPath, 'utf8')
const creationSql = readFileSync(creationMigrationPath, 'utf8')
const migrationFiles = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql'))
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

log(
  'LM-1 migration file exists',
  migrationFiles.includes('20250807_fertilizer_inventory_legacy_core_upgrade.sql'),
  '20250807_fertilizer_inventory_legacy_core_upgrade.sql',
)

const touchedExisting = migrationFiles.filter(
  (name) =>
    name !== '20250807_fertilizer_inventory_legacy_core_upgrade.sql' &&
    readFileSync(join(migrationsDir, name), 'utf8').includes(
      'upgrade_fertilizer_legacy_container_to_inventory_core',
    ),
)
log(
  'LM-2 no existing migration modified for upgrade RPC',
  touchedExisting.length === 0,
  touchedExisting.length === 0 ? 'unchanged' : touchedExisting.join(', '),
)

includesAll('LM-3 receipt table', sql, [
  'create table public.fertilizer_inventory_migration_receipts',
  'legacy_container_id uuid not null references public.fertilizer_containers',
  'migration_key text not null',
  'payload_fingerprint text not null',
  'status text not null',
  'completed_at timestamptz null',
])

includesAll('LM-4 one completed receipt per container', sql, [
  'fertilizer_inventory_migration_receipts_container_completed_idx',
  'where status = \'completed\'',
])

includesAll('LM-5 unique migration key', sql, [
  'fertilizer_inventory_migration_receipts_migration_key_idx',
])

excludesAll('LM-6 receipt has no balance columns', sql, [
  'current_balance',
  'remaining_amount',
  'balance numeric',
  'balance_value',
  'current_quantity',
])

includesAll('LM-7 upgrade RPC exists', sql, [
  'upgrade_fertilizer_legacy_container_to_inventory_core',
])

excludesAll('LM-8 RPC does not create containers', sql, [
  'insert into public.fertilizer_containers',
])

includesAll('LM-9 in-place container update', sql, [
  'update public.fertilizer_containers',
  'saved_product_profile_id = p_saved_product_profile_id',
  'product_id = null',
  'recognition_candidate_id = null',
])

includesAll('LM-10 saved profile validation', sql, [
  "v_profile.profile_status <> 'saved'",
  "v_profile.source <> 'enrichment'",
  'FOREIGN_OR_MISSING_SAVED_PROFILE',
  'INVALID_SAVED_PROFILE_STATUS',
  'INVALID_SAVED_PROFILE_SOURCE',
])

includesAll('LM-11 base unit kg or ml only', sql, [
  "p_package_size_unit not in ('kg', 'ml')",
  "p_base_unit not in ('kg', 'ml')",
  'UNSUPPORTED_PACKAGE_UNIT',
])

excludesAll('LM-12 no unit conversion', sql, [
  '* 1000',
  '/ 1000',
  'convert_g',
  'convert_l',
])

includesAll('LM-13 package value validation', sql, [
  'p_package_size_value <= 0',
  'round(p_package_size_value, 4)',
  'INVALID_PACKAGE_VALUE',
])

includesAll('LM-14 access binding validation', sql, [
  'INVALID_ACCESS_BINDING',
  'auth.uid()',
])

includesAll('LM-15 movement immutability preserved', sql, [
  'quantity_delta = v_movement.quantity_delta',
  'movement_type = v_movement.movement_type',
])

excludesAll('LM-16 no movement delete', sql, [
  'delete from public.fertilizer_stock_movements',
])

excludesAll('LM-17 no movement insert for legacy upgrade', sql, [
  'insert into public.fertilizer_stock_movements',
])

includesAll('LM-18 movement metadata supplement', sql, [
  'movement_at = coalesce(movement_at, v_movement_at)',
  'inventory_idempotency_key = coalesce(inventory_idempotency_key, v_inventory_key)',
  'source_event_ref = coalesce(source_event_ref, v_source_ref)',
  "set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true)",
])

excludesAll('LM-18b no replication role bypass', sql, [
  'session_replication_role',
  'replica',
])

excludesAll('LM-18c no trigger disable', sql, [
  'DISABLE TRIGGER',
  'ENABLE TRIGGER',
])

includesAll('LM-19 negative balance blocked', sql, ['NEGATIVE_BALANCE'])

includesAll('LM-20 aggregation blocked', sql, [
  '_legacy_migration_detect_aggregation',
  'AGGREGATED_LEGACY_CONTAINER',
])

includesAll('LM-21 creation reason limited', sql, [
  "p_creation_reason not in ('initial_stock', 'purchase', 'gift_received')",
  '_legacy_migration_validate_creation_reason',
  'AMBIGUOUS_CREATION_REASON',
])

includesAll('LM-22 receipt fingerprint idempotency', sql, [
  'MIGRATION_RECEIPT_FINGERPRINT_MISMATCH',
  '_inventory_creation_compute_fingerprint',
  'payload_fingerprint <> v_fingerprint',
])

includesAll('LM-23 container row lock', sql, ['for update'])

includesAll('LM-24 atomic transaction receipt insert', sql, [
  'insert into public.fertilizer_inventory_migration_receipts',
])

includesAll('LM-25 security definer and search_path', sql, [
  'security definer',
  'set search_path = public',
])

includesAll('LM-26 controlled grants', sql, [
  'revoke all on function public.upgrade_fertilizer_legacy_container_to_inventory_core',
  'grant execute on function public.upgrade_fertilizer_legacy_container_to_inventory_core',
  'to authenticated, service_role',
])

includesAll('LM-27 receipt table grants', sql, [
  'revoke all on public.fertilizer_inventory_migration_receipts from authenticated',
  'grant all on public.fertilizer_inventory_migration_receipts to service_role',
])

excludesAll('LM-28 no batch migration', sql, [
  'for each container',
  'migrate_all_legacy',
  'backfill',
])

excludesAll('LM-29 no UI or capture changes', sql, [
  'save_fertilizer_capture',
  'create_fertilizer_inventory_core_from_confirmed_packages',
])

excludesAll('LM-30 no secrets', sql, [
  'SUPABASE_SERVICE_ROLE_KEY',
  'postgres://',
  'eyJ',
])

excludesAll('LM-31 no external URLs', sql, ['https://', 'http://'])

includesAll('LM-32 legacy/core conflict guard', sql, [
  'LEGACY_AND_CORE_BINDING_CONFLICT',
])

includesAll('LM-33 movement unit conflict guard', sql, ['CONFLICTING_MOVEMENT_UNITS'])

includesAll('LM-34 on delete restrict for receipt container FK', sql, [
  'on delete restrict',
])

log(
  'LM-35 prior inventory core migration untouched',
  !coreSql.includes('upgrade_fertilizer_legacy_container_to_inventory_core'),
  'core migration unchanged',
)

log(
  'LM-36 prior creation migration untouched',
  !creationSql.includes('upgrade_fertilizer_legacy_container_to_inventory_core'),
  'creation migration unchanged',
)

includesAll('LM-37 hardened movement trigger', sql, [
  'create or replace function public.prevent_fertilizer_stock_movement_mutation',
  "current_setting('greenkeeper.fertilizer_legacy_upgrade', true)",
  'INVENTORY_MOVEMENT_IMMUTABLE',
])

includesAll('LM-38 business fields guarded in trigger', sql, [
  'new.quantity_delta is distinct from old.quantity_delta',
  'new.movement_type is distinct from old.movement_type',
  'new.unit is distinct from old.unit',
])

includesAll('LM-39 metadata overwrite guarded in trigger', sql, [
  'old.movement_at is not null and new.movement_at is distinct from old.movement_at',
  'old.inventory_idempotency_key is not null',
  'old.source_event_ref is not null',
])

includesAll('LM-40 transaction-local upgrade context', sql, [
  "set_config('greenkeeper.fertilizer_legacy_upgrade', '1', true)",
])

excludesAll('LM-41 no set_config replica role', sql, [
  "set_config('session_replication_role'",
])

includesAll('LM-42 coalesce preserves existing metadata', sql, [
  'coalesce(movement_at, v_movement_at)',
  'coalesce(inventory_idempotency_key, v_inventory_key)',
  'coalesce(source_event_ref, v_source_ref)',
  'coalesce(movement_origin, v_movement_origin',
])

excludesAll('LM-43 no public metadata helper RPC', sql, [
  '_legacy_migration_apply_movement',
  'grant execute on function public._legacy_migration',
])

log(
  'LM-44 core migration trigger not rewritten in place',
  !coreSql.includes('greenkeeper.fertilizer_legacy_upgrade'),
  'context only in 20250807 migration',
)

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
