/**
 * DL-031 / DL-032 — Static schema validation for multi-area fertilizer application migration.
 *
 *   node scripts/verify-fertilizer-multi-area-application-migration.mjs
 */
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationPath = join(
  __dirname,
  '../supabase/migrations/20250809_fertilizer_multi_area_application_atomic.sql',
)
const singleAreaMigrationPath = join(
  __dirname,
  '../supabase/migrations/20250808_fertilizer_application_atomic.sql',
)

const sql = readFileSync(migrationPath, 'utf8')
const singleAreaSql = readFileSync(singleAreaMigrationPath, 'utf8')
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

function extractMultiAreaRpcBody(source) {
  const fnStart = source.indexOf(
    'create or replace function public.apply_fertilizer_inventory_item_to_areas',
  )
  if (fnStart < 0) {
    return ''
  }

  const bodyStart = source.indexOf('as $$', fnStart)
  const bodyEnd = source.indexOf('$$;', bodyStart + 4)
  if (bodyStart < 0 || bodyEnd < 0) {
    return ''
  }

  return source.slice(bodyStart, bodyEnd)
}

function positionOf(body, needle) {
  const index = body.indexOf(needle)
  return index >= 0 ? index : Number.POSITIVE_INFINITY
}

includesAll('FMA-1 migration file exists', sql, [
  'fertilizer_application_batches',
  'DL-031 / DL-032',
])

includesAll('FMA-2 batch receipt table columns', sql, [
  'create table if not exists public.fertilizer_application_batches',
  'application_mode text not null',
  'selection_source text not null',
  'total_application_amount numeric(18, 4) not null',
  'request_fingerprint text not null',
  'movement_id uuid null references public.fertilizer_stock_movements',
])

includesAll('FMA-3 batch-area assignment table', sql, [
  'create table if not exists public.fertilizer_application_areas',
  'application_batch_id uuid not null references public.fertilizer_application_batches',
  'area_name_snapshot text not null',
  'area_size_sqm_snapshot numeric(10, 2) not null',
  'sort_order integer not null',
  'fertilizer_application_areas_batch_area_unique',
])

includesAll('FMA-4 fertilization_details batch extension', sql, [
  'add column if not exists application_batch_id uuid references public.fertilizer_application_batches',
  'add column if not exists area_size_sqm_snapshot numeric(10, 2)',
  'add column if not exists rate_per_sqm numeric(18, 4)',
  'add column if not exists rate_unit text',
  'fertilization_details_multi_area_batch_fields_check',
])

includesAll('FMA-5 movement application_batch_id FK', sql, [
  'add column if not exists application_batch_id uuid references public.fertilizer_application_batches',
  'fertilizer_stock_movements_application_batch_idx',
])

includesAll('FMA-6 unique movement per batch', sql, [
  'create unique index if not exists fertilizer_stock_movements_application_batch_idx',
  'on public.fertilizer_stock_movements (application_batch_id)',
  'where application_batch_id is not null',
])

includesAll('FMA-7 multi-area application RPC exists', sql, [
  'apply_fertilizer_inventory_item_to_areas',
])

includesAll('FMA-8 SECURITY DEFINER on RPC', sql, [
  'create or replace function public.apply_fertilizer_inventory_item_to_areas',
  'security definer',
])

includesAll('FMA-9 secure search_path on RPC', sql, [
  'create or replace function public.apply_fertilizer_inventory_item_to_areas',
  'set search_path = public',
])

includesAll('FMA-10 PUBLIC revoked on RPC', sql, [
  'revoke all on function public.apply_fertilizer_inventory_item_to_areas',
  'from public',
])

includesAll('FMA-11 authenticated grant on RPC', sql, [
  'grant execute on function public.apply_fertilizer_inventory_item_to_areas',
  'to authenticated',
])

includesAll('FMA-12 p_user_id parameter', sql, [
  'p_user_id uuid default null',
  'coalesce(p_user_id, auth.uid())',
])

includesAll('FMA-13 auth checks', sql, [
  'FERTILIZER_MULTI_AREA_APPLICATION_NOT_AUTHENTICATED',
  'auth.uid() is not null and v_user_id is distinct from auth.uid()',
])

includesAll('FMA-14 advisory lock for idempotency', sql, [
  'pg_advisory_xact_lock',
  '_fertilizer_application_advisory_lock_key',
])

includesAll('FMA-15 existing batch checked before insert', sql, [
  'from public.fertilizer_application_batches fab',
  'for update',
  'v_batch_exists := found',
  'if not v_batch_exists then',
  'insert into public.fertilizer_application_batches',
])

includesAll('FMA-16 FOR UPDATE on inventory item', sql, [
  'from public.fertilizer_containers fc',
  'where fc.id = p_inventory_item_id',
  'for update',
])

includesAll('FMA-17 reference validation before batch insert marker', sql, [
  'dl-031-multi-area-rpc-order: batch-after-reference-validation',
])

includesAll('FMA-18 product profile validation', sql, [
  'from public.product_profiles pp',
  'v_profile.profile_status <> \'saved\'',
  'FERTILIZER_MULTI_AREA_APPLICATION_PRODUCT_PROFILE_MISMATCH',
])

includesAll('FMA-19 inventory access_kind validation', sql, [
  'v_item.access_kind <> \'authenticated_user\'',
  'FERTILIZER_MULTI_AREA_APPLICATION_INVENTORY_ITEM_NOT_ACCESSIBLE',
])

includesAll('FMA-20 at least one area required', sql, [
  'FERTILIZER_MULTI_AREA_APPLICATION_NO_AREAS_SELECTED',
  'v_area_count <= 0',
])

includesAll('FMA-21 duplicate area rejected', sql, [
  'FERTILIZER_MULTI_AREA_APPLICATION_DUPLICATE_AREA',
  'v_area_id_text = any (v_seen_area_ids)',
])

includesAll('FMA-22 area ownership validation', sql, [
  'v_area_row.user_id is distinct from v_user_id',
  'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_TARGET_NOT_ACCESSIBLE',
])

includesAll('FMA-23 name and size snapshot validation', sql, [
  'FERTILIZER_MULTI_AREA_APPLICATION_AREA_SNAPSHOT_MISMATCH',
  'areaNameSnapshot',
  'areaSizeSqmSnapshot',
])

includesAll('FMA-24 lowercase text sort for areas', sql, [
  'jsonb_agg(entry order by lower(entry ->> \'areaId\'))',
  'order by lower(a.id::text)',
  'order by lower(entry ->> \'areaId\')',
])

log(
  'FMA-25 no native UUID sort in RPC body',
  !extractMultiAreaRpcBody(sql).includes('order by a.id\n') &&
    !extractMultiAreaRpcBody(sql).includes('order by a.id '),
  'area ordering uses lower(id::text), not raw uuid order',
)

includesAll('FMA-26 rate_per_sqm application mode', sql, [
  "'rate_per_sqm'",
  "p_application_mode = 'rate_per_sqm'",
  '_fertilizer_multi_area_compute_amount_from_rate',
])

includesAll('FMA-27 total_amount_proportional mode', sql, [
  "'total_amount_proportional'",
  "p_application_mode = 'total_amount_proportional'",
  '_fertilizer_multi_area_validate_proportional_distribution',
])

includesAll('FMA-28 floor distribution in proportional helper', sql, [
  'floor(',
  'floored_share bigint not null default 0',
])

includesAll('FMA-29 remainder to largest area', sql, [
  'order by w.area_size_scaled desc, w.area_id desc',
  'v_remainder > 0',
])

includesAll('FMA-30 tie-break higher area id', sql, [
  'order by w.area_size_scaled desc, w.area_id desc',
])

includesAll('FMA-31 exact scaled sum validation', sql, [
  'v_total_scaled := v_total_scaled + v_actual_scaled',
  'v_total_scaled is distinct from public._fertilizer_multi_area_scale_quantity(p_total_application_amount)',
])

includesAll('FMA-32 kg and ml application units only', sql, [
  "application_unit in ('kg', 'ml')",
  "p_application_unit not in ('kg', 'ml')",
  "application_unit in ('kg', 'ml')",
])

includesAll('FMA-33 g_per_sqm and ml_per_sqm rate units only', sql, [
  "rate_unit in ('g_per_sqm', 'ml_per_sqm')",
  "rate_unit is null or rate_unit in ('g_per_sqm', 'ml_per_sqm')",
  '_fertilizer_multi_area_effort_rate_unit',
])

const rpcBody = extractMultiAreaRpcBody(sql)

excludesAll('FMA-34 no kg↔ml conversion in RPC body', rpcBody, [
  '* 1000',
  '/ 1000',
  'convert_unit',
  'kg_to_ml',
  'ml_to_kg',
])

excludesAll('FMA-35 no direct g/l stock units in RPC body', rpcBody, [
  "'g'",
  "'l'",
  "in ('g', 'l')",
  "not in ('g', 'l')",
])

includesAll('FMA-36 minimum application amount 0.0001', sql, [
  '_fertilizer_multi_area_quantity_scale()',
  'select 10000',
  'v_actual_scaled < 1',
  'FERTILIZER_MULTI_AREA_APPLICATION_APPLICATION_AMOUNT_TOO_SMALL',
])

includesAll('FMA-37 balance derived from movements', sql, [
  'coalesce(sum(fsm.quantity_delta), 0)',
  'from public.fertilizer_stock_movements fsm',
  'FERTILIZER_MULTI_AREA_APPLICATION_INSUFFICIENT_STOCK',
])

excludesAll('FMA-38 no stored current quantity', sql, [
  'current_quantity',
  'remaining_amount',
  'add column if not exists balance',
])

includesAll('FMA-39 one activity per area in loop', rpcBody, [
  'insert into public.activities',
  'for v_area_idx in 0 .. (v_area_count - 1) loop',
])

includesAll('FMA-40 one fertilization detail per area', rpcBody, [
  'insert into public.fertilization_details',
  'application_batch_id',
])

includesAll('FMA-41 one batch-area assignment per area', rpcBody, [
  'insert into public.fertilizer_application_areas',
  'application_batch_id',
])

includesAll('FMA-42 one movement per batch', rpcBody, [
  'insert into public.fertilizer_stock_movements',
  'v_movement_id := gen_random_uuid()',
])

includesAll('FMA-43 movement linked to batch', rpcBody, [
  'application_batch_id,',
  'v_batch_id,',
  'movement_id = v_movement_id',
])

includesAll('FMA-44 primary activity on movement', rpcBody, [
  'v_primary_activity_id',
  'activity_id,',
  'v_primary_activity_id,',
])

includesAll('FMA-45 batch completion at end', rpcBody, [
  'update public.fertilizer_application_batches',
  'completed_at = v_now',
  'result_jsonb = jsonb_build_object',
])

includesAll('FMA-46 result JSON payload fields', rpcBody, [
  "'applicationBatchId', v_batch_id",
  "'movementId', v_movement_id",
  "'primaryActivityId', v_primary_activity_id",
  "'resultingBalance', v_resulting_balance",
  "'areas', v_result_areas",
])

includesAll('FMA-47 idempotent replay', rpcBody, [
  'idempotentReplay',
  'v_batch.result_jsonb || jsonb_build_object(\'idempotentReplay\', true)',
])

includesAll('FMA-48 idempotency conflict', rpcBody, [
  'FERTILIZER_MULTI_AREA_APPLICATION_IDEMPOTENCY_CONFLICT',
  'v_batch.request_fingerprint is distinct from v_fingerprint',
])

log(
  'FMA-49 rollback implicit in plpgsql transaction',
  rpcBody.includes('language plpgsql') === false &&
    sql.includes('language plpgsql') &&
    !rpcBody.includes('commit;') &&
    !rpcBody.includes('rollback;'),
  'RPC body has no explicit commit/rollback — failures roll back atomically',
)

includesAll('FMA-50 batch immutability guards', sql, [
  'prevent_fertilizer_application_batch_mutation',
  'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_IMMUTABLE',
  'prevent_fertilizer_application_batch_update',
  'prevent_fertilizer_application_batch_delete',
])

includesAll('FMA-51 batch-area immutability guards', sql, [
  'prevent_fertilizer_application_area_mutation',
  'FERTILIZER_MULTI_AREA_APPLICATION_BATCH_AREA_IMMUTABLE',
])

includesAll('FMA-52 inventory-coupled activity immutability', sql, [
  'prevent_inventory_coupled_activity_mutation',
  'FERTILIZER_APPLICATION_ACTIVITY_IMMUTABLE',
])

includesAll('FMA-53 inventory-coupled fertilization immutability', sql, [
  'prevent_inventory_coupled_fertilization_details_mutation',
  'FERTILIZER_APPLICATION_FERTILIZATION_IMMUTABLE',
])

includesAll('FMA-54 area deletion contract', sql, [
  'greenkeeper.area_deletion_id',
  'set_area_deletion_context',
  'areas_set_deletion_context',
  'before delete on public.areas',
])

excludesAll('FMA-55 no session_replication_role', sql, ['session_replication_role'])

excludesAll('FMA-56 no trigger disable', sql, [
  'disable trigger',
  'ALTER TABLE ... DISABLE',
])

excludesAll('FMA-57 no superuser assumption', sql, ['superuser', 'rolsuper'])

excludesAll('FMA-58 no automatic data migration', sql, [
  'update public.fertilizer_stock_movements set',
  'insert into public.activities select',
  'update public.fertilization_details set',
])

log(
  'FMA-59 single-area RPC unchanged in 20250808 migration',
  singleAreaSql.includes('create or replace function public.apply_fertilizer_inventory_item_to_area'),
  singleAreaSql.includes('create or replace function public.apply_fertilizer_inventory_item_to_area')
    ? '20250808 still defines apply_fertilizer_inventory_item_to_area'
    : '20250808 missing single-area apply RPC',
)

log(
  'FMA-60 multi-area migration does not replace single-area RPC',
  !sql.includes('create or replace function public.apply_fertilizer_inventory_item_to_area('),
  !sql.includes('create or replace function public.apply_fertilizer_inventory_item_to_area(')
    ? '20250809 does not redefine single-area apply RPC'
    : '20250809 must not redefine apply_fertilizer_inventory_item_to_area',
)

const advisoryLockPos = positionOf(rpcBody, 'pg_advisory_xact_lock')
const batchSelectPos = positionOf(rpcBody, 'from public.fertilizer_application_batches fab')
const containerLockPos = positionOf(rpcBody, 'from public.fertilizer_containers fc')
const profileLoadPos = positionOf(rpcBody, 'from public.product_profiles pp')
const areaLockPos = positionOf(rpcBody, 'order by lower(a.id::text)')
const batchInsertPos = positionOf(rpcBody, 'insert into public.fertilizer_application_batches')
const orderMarkerPos = positionOf(
  rpcBody,
  'dl-031-multi-area-rpc-order: batch-after-reference-validation',
)

log(
  'FMA-61 RPC order marker present',
  orderMarkerPos < Number.POSITIVE_INFINITY,
  orderMarkerPos < Number.POSITIVE_INFINITY
    ? 'batch-after-reference-validation marker found'
    : 'missing dl-031-multi-area-rpc-order marker',
)

log(
  'FMA-62 advisory lock before batch read',
  advisoryLockPos < batchSelectPos,
  advisoryLockPos < batchSelectPos
    ? 'advisory lock precedes batch select'
    : 'advisory lock must precede batch select',
)

log(
  'FMA-63 existing batch read before batch insert',
  batchSelectPos < batchInsertPos,
  batchSelectPos < batchInsertPos
    ? 'batch select precedes batch insert'
    : 'batch must be read before insert',
)

log(
  'FMA-64 inventory lock before batch insert',
  containerLockPos < batchInsertPos,
  containerLockPos < batchInsertPos
    ? 'container lock precedes batch insert'
    : 'inventory item must be locked before batch insert',
)

log(
  'FMA-65 product profile validation before batch insert',
  profileLoadPos < batchInsertPos,
  profileLoadPos < batchInsertPos
    ? 'profile load precedes batch insert'
    : 'product profile must be validated before batch insert',
)

log(
  'FMA-66 area validation before batch insert',
  areaLockPos < batchInsertPos,
  areaLockPos < batchInsertPos
    ? 'area lock precedes batch insert'
    : 'areas must be validated before batch insert',
)

log(
  'FMA-67 batch insert only after reference validation',
  orderMarkerPos < batchInsertPos && containerLockPos < batchInsertPos && areaLockPos < batchInsertPos,
  orderMarkerPos < batchInsertPos && containerLockPos < batchInsertPos && areaLockPos < batchInsertPos
    ? 'batch insert follows reference validation marker and checks'
    : 'batch insert must follow all reference validation',
)

const failed = results.filter((entry) => !entry.ok)
if (failed.length > 0) {
  process.exitCode = 1
  console.error(`\n${failed.length} migration verification check(s) failed.`)
} else {
  console.log(`\nAll ${results.length} migration verification checks passed.`)
}
